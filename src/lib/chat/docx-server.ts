import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { docxXmlToText } from "./docx";

// Bóc text .docx Ở SERVER (như /api/pdf — chạy mọi thiết bị). .docx = zip; lấy
// `word/document.xml` qua `unzip -p` rồi parse (docxXmlToText). Pure Node execFile,
// dep `unzip` cực nhẹ (Dockerfile) — KHÔNG thêm npm dep (tránh lockfile/musl).

const TOOL_TIMEOUT = 30_000;
const MAX_BUF = 64 * 1024 * 1024;

/** `unzip` có trên host không — route degrade rõ ràng nếu thiếu. */
export function docxAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("unzip", ["-v"], { timeout: 5000 }, (err) => resolve(!err));
  });
}

export async function extractDocx(buf: Buffer): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laam-docx-"));
  const docxPath = path.join(dir, "in.docx");
  try {
    await fs.writeFile(docxPath, buf);
    const xml = await new Promise<string>((resolve, reject) => {
      execFile(
        "unzip",
        ["-p", docxPath, "word/document.xml"],
        { timeout: TOOL_TIMEOUT, maxBuffer: MAX_BUF, encoding: "utf8" },
        (err, stdout) => (err ? reject(err) : resolve(stdout || "")),
      );
    });
    return docxXmlToText(xml);
  } finally {
    fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
