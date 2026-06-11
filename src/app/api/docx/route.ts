import { auth } from "@/auth";
import { extractDocx, docxAvailable } from "@/lib/chat/docx-server";

// POST /api/docx — bóc text .docx Ở SERVER (unzip + parse word/document.xml), thay
// cho việc đọc nhị phân phía client (ra rác). Nhận file qua multipart, trả {text}.
// GET /api/docx — báo unzip có sẵn không.

const MAX_DOCX_BYTES = 25 * 1024 * 1024;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  return Response.json({ available: await docxAvailable() });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  if (!(await docxAvailable())) {
    return Response.json({ error: "DOCX chưa sẵn sàng: thiếu unzip trên máy chủ" }, { status: 503 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return Response.json({ error: "yêu cầu không hợp lệ" }, { status: 400 });
  }

  if (!file) return Response.json({ error: "thiếu file" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  if (!buf.length) return Response.json({ error: "file rỗng" }, { status: 400 });
  if (buf.length > MAX_DOCX_BYTES) return Response.json({ error: "DOCX quá lớn (>25MB)" }, { status: 413 });
  // .docx là zip → bắt đầu bằng "PK". (.doc nhị phân cũ KHÔNG phải zip → báo rõ.)
  if (buf.subarray(0, 2).toString("latin1") !== "PK") {
    return Response.json({ error: "không phải tệp .docx (zip) hợp lệ" }, { status: 400 });
  }

  try {
    const text = await extractDocx(buf);
    return Response.json({ text });
  } catch (e) {
    // Fail loud (Rule 12).
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return Response.json({ error: "đọc DOCX thất bại: " + msg }, { status: 500 });
  }
}
