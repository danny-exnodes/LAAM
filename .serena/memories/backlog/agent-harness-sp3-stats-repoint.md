# Backlog: repoint /api/stats → shared loadSessionRows (SP-3 follow-up)

**Nguồn:** final review SP-3 (2026-06-05). **Ưu tiên:** thấp (cleanup, không chặn).

SP-3 đã rút `loadSessionRows` ra `src/lib/agent/tools/laam/_load.ts` (verdict A2(b)) và cho `query-stats.ts` dùng chung. NHƯNG `src/app/api/stats/route.ts` vẫn còn **bản sao** select+map riêng (cố ý không đụng để giữ test stats xanh — verdict A2 "ưu tiên không phá test").

**Việc:** repoint `/api/stats/route.ts` sang `import { loadSessionRows } from "@/lib/agent/tools/laam/_load"` để xoá bản sao cuối. **Điều kiện:** chỉ swap nếu test `/api/stats` giữ xanh (shape `SessionRow` phải khớp). Nếu shape lệch → giữ nguyên + ghi chú.

Liên quan: [[agent-harness-sp3-memory-proactive]].
