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
});

function makeResponse(body: string, status: number, contentType: string): Response {
  const value = new Response(body, { status, headers: { "content-type": contentType } });
  Object.defineProperty(value, "url", { value: url });
  return value;
}
