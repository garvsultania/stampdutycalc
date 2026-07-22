import { WatchdogError } from "./errors.js";
import type { Fetcher, RequestSpec, ResponseRecord } from "./types.js";

const USER_AGENT = "StampDraft-Watchdog/0.1 (primary-source archival; contact: watchdog@stampdraft.local)";

export interface HttpFetcherOptions {
  /** When omitted, requests and redirects are restricted to the initial host. */
  allowedHosts?: string[];
  minIntervalMs?: number;
  maxAttempts?: number;
  baseBackoffMs?: number;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
  maxRedirects?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  record?: (response: ResponseRecord) => Promise<void>;
}

export class HttpFetcher implements Fetcher {
  private readonly cookies = new Map<string, Map<string, string>>();
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly minIntervalMs: number;
  private readonly maxAttempts: number;
  private readonly baseBackoffMs: number;
  private readonly requestTimeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly maxRedirects: number;
  private readonly allowedHosts?: ReadonlySet<string>;
  private lastRequestAt = 0;

  constructor(private readonly options: HttpFetcherOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.minIntervalMs = options.minIntervalMs ?? 2_000;
    this.maxAttempts = options.maxAttempts ?? 4;
    this.baseBackoffMs = options.baseBackoffMs ?? 1_000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 180_000;
    this.maxResponseBytes = options.maxResponseBytes ?? 100 * 1024 * 1024;
    this.maxRedirects = options.maxRedirects ?? 5;
    this.allowedHosts = options.allowedHosts ? new Set(options.allowedHosts.map((host) => host.toLowerCase())) : undefined;
  }

  async request(spec: RequestSpec): Promise<ResponseRecord> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      await this.waitForPoliteness();
      try {
        const response = await this.fetchOnce(spec);
        await this.options.record?.(response);
        if ((response.status === 429 || response.status >= 500) && attempt < this.maxAttempts) {
          await this.sleep(this.retryDelay(attempt, response.headers["retry-after"]));
          continue;
        }
        if (response.status < 200 || response.status >= 400) {
          throw new WatchdogError(`HTTP ${response.status} fetching ${spec.url}`, "source_unreachable");
        }
        return response;
      } catch (error) {
        lastError = error;
        if (error instanceof WatchdogError || attempt === this.maxAttempts) break;
        await this.sleep(this.retryDelay(attempt));
      }
    }
    if (lastError instanceof WatchdogError) throw lastError;
    throw new WatchdogError(`Network failure fetching ${spec.url}: ${errorText(lastError)}`, "source_unreachable", lastError);
  }

  private async fetchOnce(spec: RequestSpec): Promise<ResponseRecord> {
    const initialUrl = new URL(spec.url);
    const allowedHosts = this.allowedHosts ?? new Set([initialUrl.hostname.toLowerCase()]);
    assertAllowedUrl(initialUrl, allowedHosts);
    let currentUrl = initialUrl;
    let method = spec.method ?? "GET";
    const headers = new Headers({
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
    });
    let body: string | undefined;
    if (method === "POST") {
      headers.set("content-type", "application/x-www-form-urlencoded");
      body = new URLSearchParams(spec.formValues ?? {}).toString();
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      let response: Response | undefined;
      for (let redirect = 0; redirect <= this.maxRedirects; redirect++) {
        const cookie = this.cookieHeader(currentUrl.href);
        if (cookie) headers.set("cookie", cookie);
        else headers.delete("cookie");
        response = await this.fetchImpl(currentUrl, { method, headers, body, redirect: "manual", signal: controller.signal });
        const responseUrl = response.url ? new URL(response.url) : currentUrl;
        assertAllowedUrl(responseUrl, allowedHosts);
        this.captureCookies(responseUrl.href, response.headers);
        if (!isRedirect(response.status)) break;
        const location = response.headers.get("location");
        if (!location) {
          throw new WatchdogError(`Redirect from ${currentUrl.href} omitted Location`, "shape_drift");
        }
        if (redirect === this.maxRedirects) {
          throw new WatchdogError(`Too many redirects fetching ${spec.url}`, "shape_drift");
        }
        const nextUrl = new URL(location, responseUrl);
        assertAllowedUrl(nextUrl, allowedHosts);
        await response.body?.cancel();
        if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
          method = "GET";
          body = undefined;
          headers.delete("content-type");
        }
        currentUrl = nextUrl;
      }
      if (!response) throw new WatchdogError(`No response fetching ${spec.url}`, "source_unreachable");
      const responseHeaders = Object.fromEntries(response.headers.entries());
      const declaredBytes = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredBytes) && declaredBytes > this.maxResponseBytes) {
        throw new WatchdogError(
          `Response from ${spec.url} declares ${declaredBytes} bytes, exceeding ${this.maxResponseBytes}`,
          "shape_drift",
        );
      }
      const responseBody = await readBoundedBody(response, spec.url, this.maxResponseBytes);
      return {
        url: response.url || currentUrl.href,
        status: response.status,
        mediaType: response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "application/octet-stream",
        body: responseBody,
        headers: responseHeaders,
        request: { method, url: spec.url, ...(spec.formValues ? { formValues: spec.formValues } : {}) },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private captureCookies(url: string, headers: Headers): void {
    const origin = new URL(url).origin;
    const jar = this.cookies.get(origin) ?? new Map<string, string>();
    const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    const values = getSetCookie ? getSetCookie.call(headers) : splitSetCookie(headers.get("set-cookie"));
    for (const value of values) {
      const pair = value.split(";", 1)[0];
      const separator = pair?.indexOf("=") ?? -1;
      if (!pair || separator <= 0) continue;
      jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
    }
    this.cookies.set(origin, jar);
  }

  private cookieHeader(url: string): string | undefined {
    const jar = this.cookies.get(new URL(url).origin);
    if (!jar || jar.size === 0) return undefined;
    return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  private async waitForPoliteness(): Promise<void> {
    const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
    if (wait > 0) await this.sleep(wait);
    this.lastRequestAt = Date.now();
  }

  private retryDelay(attempt: number, retryAfter?: string): number {
    const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
    return this.baseBackoffMs * 2 ** (attempt - 1);
  }
}

function assertAllowedUrl(url: URL, allowedHosts: ReadonlySet<string>): void {
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname.toLowerCase())) {
    throw new WatchdogError(`Request or redirect leaves the HTTPS host allowlist: ${url.href}`, "shape_drift");
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function readBoundedBody(response: Response, requestUrl: string, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new WatchdogError(
        `Response from ${requestUrl} contains more than ${maxBytes} bytes`,
        "shape_drift",
      );
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function splitSetCookie(value: string | null): string[] {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,=]+=[^;,]+)/);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
