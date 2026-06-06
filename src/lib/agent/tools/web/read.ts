import type { Tool } from "../../types";
import { fetchReadable } from "@/lib/web/readable";

// Cap below the guard's 8192-byte output bound, leaving room for url/title + JSON
// overhead. The /api/fetch-url route keeps a larger cap (a human reads that); the
// model gets a tighter slice to protect its context window.
const WEB_READ_MAX_TEXT = 6000;

export const webRead: Tool = {
  name: "web_read",
  description:
    "Đọc nội dung một trang web theo URL (http/https): trả tiêu đề + văn bản đã làm sạch. " +
    "Dùng để đọc sâu một liên kết, ví dụ một kết quả từ web_search.",
  kind: "read",
  parameters: {
    type: "object",
    properties: { url: { type: "string", description: "URL http/https cần đọc" } },
    required: ["url"],
  },
  async handler(args) {
    const r = await fetchReadable(String(args.url ?? ""), { maxText: WEB_READ_MAX_TEXT });
    return r.ok ? r.data : { error: r.error };
  },
};
