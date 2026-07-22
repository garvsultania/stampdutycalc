import { describe, expect, it, vi } from "vitest";
import { HttpFetcher } from "./fetcher.js";

const url = "https://example.test/source";

describe("HTTP fetcher", () => {
  it("records failed attempts before retrying and returning success", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeResponse("busy", 500, "text/plain"))
      .mockResolvedValueOnce(makeResponse("ok", 200, "text/html"));
    const record = vi.fn();
    const fetcher = new HttpFetcher({ fetchImpl, record, minIntervalMs: 0, baseBackoffMs: 0, sleep: async () => {} });

    const response = await fetcher.request({ url });

    expect(response.status).toBe(200);
    expect(record).toHaveBeenCalledTimes(2);
    expect(record.mock.calls.map(([entry]) => entry.status)).toEqual([500, 200]);
  });

  it("records a final HTTP failure before throwing", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(makeResponse("missing", 404, "text/plain"));
    const record = vi.fn();
    const fetcher = new HttpFetcher({ fetchImpl, record, minIntervalMs: 0, sleep: async () => {} });

    await expect(fetcher.request({ url })).rejects.toThrow(/HTTP 404/);
    expect(record).toHaveBeenCalledOnce();
    expect(record.mock.calls[0]?.[0].status).toBe(404);
  });

  it("aborts a request that exceeds the configured timeout", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const fetcher = new HttpFetcher({ fetchImpl, minIntervalMs: 0, maxAttempts: 1, requestTimeoutMs: 1 });

    await expect(fetcher.request({ url })).rejects.toThrow(/Network failure/);
  });

  it("rejects a response whose declared size exceeds the configured bound", async () => {
    const response = makeResponse("small fixture", 200, "application/pdf");
    response.headers.set("content-length", "1000");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    const fetcher = new HttpFetcher({ fetchImpl, minIntervalMs: 0, maxResponseBytes: 100 });

    await expect(fetcher.request({ url })).rejects.toThrow(/exceeding 100/);
  });

  it("cancels an undeclared streaming body as soon as it crosses the byte limit", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(60));
        controller.enqueue(new Uint8Array(60));
      },
      cancel() {
        cancelled = true;
      },
    });
    const response = new Response(body, { status: 200, headers: { "content-type": "application/pdf" } });
    Object.defineProperty(response, "url", { value: url });
    const fetcher = new HttpFetcher({
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response),
      minIntervalMs: 0,
      maxResponseBytes: 100,
    });

    await expect(fetcher.request({ url })).rejects.toThrow(/more than 100 bytes/);
    expect(cancelled).toBe(true);
  });

  it("blocks a redirect before fetching a host outside the source allowlist", async () => {
    const redirect = makeResponse("", 302, "text/plain");
    redirect.headers.set("location", "https://outside.test/document.pdf");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(redirect);
    const fetcher = new HttpFetcher({
      fetchImpl,
      allowedHosts: ["example.test"],
      minIntervalMs: 0,
    });

    await expect(fetcher.request({ url })).rejects.toThrow(/leaves the HTTPS host allowlist/);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("follows a relative redirect on an allowlisted host", async () => {
    const redirect = makeResponse("", 302, "text/plain");
    redirect.headers.set("location", "/final");
    const final = makeResponse("ok", 200, "text/html", "https://example.test/final");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(redirect).mockResolvedValueOnce(final);
    const fetcher = new HttpFetcher({ fetchImpl, allowedHosts: ["example.test"], minIntervalMs: 0 });

    await expect(fetcher.request({ url })).resolves.toMatchObject({ status: 200, url: "https://example.test/final" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

function makeResponse(body: string, status: number, contentType: string, responseUrl = url): Response {
  const value = new Response(body, { status, headers: { "content-type": contentType } });
  Object.defineProperty(value, "url", { value: responseUrl });
  return value;
}
