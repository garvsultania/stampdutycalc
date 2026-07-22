import type { SourceId } from "./types.js";

export interface OcrRecord {
  source_id: SourceId;
  sha256: string;
  status: "ok" | "failed";
  languages: string[];
  tool: string;
  tool_version: string;
  output_file?: string;
  error?: string;
}

export function ocrLanguages(sourceId: SourceId): string[] {
  if (sourceId.startsWith("dl-") || sourceId.startsWith("up-")) return ["hin", "eng"];
  if (sourceId.startsWith("tn-")) return ["tam", "eng"];
  if (sourceId.startsWith("gj-")) return ["guj", "eng"];
  if (sourceId.startsWith("ka-")) return ["kan", "eng"];
  if (sourceId.startsWith("mh-")) return ["mar", "eng"];
  if (sourceId.startsWith("tg-")) return ["tel", "urd", "eng"];
  return ["eng"];
}
