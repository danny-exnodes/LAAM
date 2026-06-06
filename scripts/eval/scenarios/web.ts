import type { Scenario } from "../types";

// Research-loop: cần web → web_search (tìm) RỒI web_read (đọc sâu) → trích URL THẬT (citesRealUrl).
export const webResearch: Scenario = {
  id: "web-research-loop", capability: "tool-selection",
  input: "Next.js 16 có gì mới? Tìm trên web và dẫn nguồn (URL).",
  toolStubs: {
    web_search: { query: "Next.js 16", results: [
      { title: "Next.js 16", url: "https://nextjs.org/blog/next-16", snippet: "Turbopack mặc định, React 19." },
      { title: "HN thread", url: "https://news.ycombinator.com/item?id=1", snippet: "thảo luận" },
    ] },
    web_read: { url: "https://nextjs.org/blog/next-16", title: "Next.js 16", text: "Next.js 16: Turbopack là bundler mặc định.", truncated: false },
  },
  expect: {
    callsTool: ["web_search", "web_read"],
    citesRealUrl: ["https://nextjs.org/blog/next-16", "https://news.ycombinator.com/item?id=1"],
    finalContains: ["Turbopack"], maxRounds: 3,
  },
};

// Web-restraint: câu trả được từ dữ liệu LAAM nội bộ → KHÔNG web_search.
export const webRestraint: Scenario = {
  id: "web-restraint", capability: "tool-selection",
  input: "Có bao nhiêu agent đang chạy trong hệ thống LAAM?",
  toolStubs: { laam_query_stats: { totals: { sessions: 12, running: 3 }, byStatus: { running: 3 } } },
  expect: { callsTool: "laam_query_stats", notCalls: ["web_search", "web_read"], finalContains: ["3"], maxRounds: 2 },
};
