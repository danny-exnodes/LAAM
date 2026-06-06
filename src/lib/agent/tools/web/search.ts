import type { Tool } from "../../types";
import { searxngSearch } from "@/lib/web/searxng";

export const webSearch: Tool = {
  name: "web_search",
  description:
    "Tìm kiếm trên web (qua SearXNG self-host), trả danh sách kết quả: tiêu đề, URL, trích đoạn. " +
    "Dùng khi cần thông tin hiện hành hoặc ngoài dữ liệu LAAM; sau đó có thể web_read một URL để đọc sâu.",
  kind: "read",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Truy vấn tìm kiếm" },
      count: { type: "number", description: "Số kết quả tối đa (mặc định 5, tối đa 10)" },
    },
    required: ["query"],
  },
  async handler(args) {
    const r = await searxngSearch(String(args.query ?? ""), {
      count: typeof args.count === "number" ? args.count : undefined,
    });
    return r.ok ? { query: r.query, results: r.results } : { error: r.error };
  },
};
