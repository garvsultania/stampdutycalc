import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ResponseRecorder } from "./recording.js";
import type { ResponseRecord } from "./types.js";

describe("response recorder", () => {
  it("writes ordered bodies and metadata without credential-bearing headers", async () => {
    const root = await mkdtemp(join(tmpdir(), "stampdraft-recording-"));
    const recorder = new ResponseRecorder(root);
    const response: ResponseRecord = {
      url: "https://example.test/search",
      status: 200,
      mediaType: "text/html",
      body: new TextEncoder().encode("<html>fixture</html>"),
      headers: {
        "content-type": "text/html",
        "set-cookie": "session=secret",
        authorization: "Bearer secret",
        "x-request-id": "request-1",
      },
      request: { method: "GET", url: "https://example.test/search" },
    };

    await recorder.record(response);

    expect(await readFile(join(root, "bodies", "0001.html"), "utf8")).toBe("<html>fixture</html>");
    const meta = JSON.parse(await readFile(join(root, "0001.json"), "utf8"));
    expect(meta).toMatchObject({
      sequence: 1,
      response: { body_file: "bodies/0001.html", bytes: 20 },
    });
    expect(meta.response.headers).toEqual({
      "content-type": "text/html",
      "x-request-id": "request-1",
    });
  });

  it("uses a PDF extension when the response media type identifies a PDF", async () => {
    const root = await mkdtemp(join(tmpdir(), "stampdraft-recording-"));
    const recorder = new ResponseRecorder(root);

    await recorder.record({
      url: "https://example.test/download",
      status: 200,
      mediaType: "application/pdf",
      body: new TextEncoder().encode("%PDF-1.7\n"),
      headers: {},
      request: { method: "POST", url: "https://example.test/download" },
    });

    const meta = JSON.parse(await readFile(join(root, "0001.json"), "utf8"));
    expect(meta.response.body_file).toBe("bodies/0001.pdf");
  });
});
