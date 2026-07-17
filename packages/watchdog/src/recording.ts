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
      request: response.request,
      response: {
        url: response.url,
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
