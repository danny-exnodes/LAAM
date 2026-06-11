import { auth } from "@/auth";
import { extractPdf, popplerAvailable } from "@/lib/chat/pdf-server";

// POST /api/pdf — trích nội dung PDF Ở SERVER (poppler + tesseract), thay cho
// pdfjs phía client (vốn vỡ trên Safari/iOS theo phiên bản trình duyệt). Nhận file
// qua multipart, trả PdfTierResult: {via:"text"|"ocr",text} | {via:"vision",images}
// | {via:"empty"}. Chạy y hệt trên mọi thiết bị vì xử lý nằm ở một môi trường server.
// GET /api/pdf — báo poppler có sẵn không (client degrade rõ ràng).

const MAX_PDF_BYTES = 25 * 1024 * 1024;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  return Response.json({ available: await popplerAvailable() });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  if (!(await popplerAvailable())) {
    return Response.json(
      { error: "PDF chưa sẵn sàng: thiếu poppler-utils trên máy chủ" },
      { status: 503 },
    );
  }

  let file: File | null = null;
  let visionMax = 2;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
    const vm = Number(form.get("visionMax"));
    if (Number.isFinite(vm)) visionMax = Math.max(0, Math.min(4, Math.floor(vm)));
  } catch {
    return Response.json({ error: "yêu cầu không hợp lệ" }, { status: 400 });
  }

  if (!file) return Response.json({ error: "thiếu file" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  if (!buf.length) return Response.json({ error: "file rỗng" }, { status: 400 });
  if (buf.length > MAX_PDF_BYTES) return Response.json({ error: "PDF quá lớn (>25MB)" }, { status: 413 });
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return Response.json({ error: "không phải tệp PDF hợp lệ" }, { status: 400 });
  }

  try {
    const { tier, thumb } = await extractPdf(buf, { visionMax });
    // thumb = data URL trang 1 (preview attachment, hiện lại sau reload).
    return Response.json({ ...tier, thumb });
  } catch (e) {
    // Fail loud: lộ lý do thật (Rule 12) thay vì "lỗi hệ thống" mơ hồ.
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return Response.json({ error: "đọc PDF thất bại: " + msg }, { status: 500 });
  }
}
