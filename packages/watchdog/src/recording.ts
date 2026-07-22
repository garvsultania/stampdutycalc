import { mkdir, writeFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import type { RecordedResponseMeta, ResponseRecord } from "./types.js";

export class ResponseRecorder {
  private sequence = 0;

  constructor(private readonly runDir: string) {}

  async record(response: ResponseRecord): Promise<void> {
    const sequence = ++this.sequence;
    const bodiesDir = join(this.runDir, "bodies");
    await mkdir(bodiesDir, { recursive: true });

    const extension = extensionFor(response);
    const name = `${String(sequence).padStart(4, "0")}${extension}`;
    const bodyPath = join(bodiesDir, name);
    await writeFile(bodyPath, response.body, { flag: "wx" });

    const meta: RecordedResponseMeta = {
      sequence,
      request: sanitizedRequest(response.request),
      response: {
        url: sanitizedUrl(response.url),
        status: response.status,
        media_type: response.mediaType,
        headers: sanitizedHeaders(response.headers),
        body_file: relative(this.runDir, bodyPath),
        bytes: response.body.byteLength,
      },
    };
    await writeFile(join(this.runDir, `${String(sequence).padStart(4, "0")}.json`), JSON.stringify(meta, null, 2) + "\n", {
      flag: "wx",
    });
  }
}

export function sanitizedRequest(request: ResponseRecord["request"]): ResponseRecord["request"] {
  const url = sanitizedUrl(request.url);
  if (!request.formValues) return { ...request, url };
  const formValues = Object.fromEntries(
    Object.entries(request.formValues).filter(([name]) => !isSensitiveFormField(name)),
  );
  return {
    method: request.method,
    url,
    ...(Object.keys(formValues).length > 0 ? { formValues } : {}),
  };
}

function isSensitiveFormField(name: string): boolean {
  return (
    /^__(?:VIEWSTATE|EVENTVALIDATION)/i.test(name) ||
    /(?:authorization|cookie|csrf|hiddenfield|password|passwd|requestverification|secret|session|token)/i.test(name)
  );
}

export function sanitizedUrl(value: string): string {
  const url = new URL(value);
  let changed = false;
  if (url.username || url.password) {
    url.username = "";
    url.password = "";
    changed = true;
  }
  for (const name of [...url.searchParams.keys()]) {
    if (!isSensitiveFormField(name)) continue;
    url.searchParams.delete(name);
    changed = true;
  }
  return changed ? url.href : value;
}

function extensionFor(response: ResponseRecord): string {
  const pathExtension = extname(new URL(response.url).pathname).toLowerCase();
  if (response.mediaType.includes("pdf") || pathExtension === ".pdf") return ".pdf";
  if (response.mediaType.includes("html")) return ".html";
  return pathExtension || ".bin";
}

function sanitizedHeaders(headers: Record<string, string>): Record<string, string> {
  const sensitive = new Set(["authorization", "cookie", "proxy-authorization", "proxy-authenticate", "set-cookie"]);
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !sensitive.has(name.toLowerCase())));
}
