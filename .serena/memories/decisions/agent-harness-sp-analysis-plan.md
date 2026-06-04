# Plan (PM): đào sâu phân tích các SP — mức song song

**Ngày:** 2026-06-04 · **Vai trò:** technical PM · Bối cảnh: roadmap [[agent-harness-architecture]] đã chốt; cần phân rã từng SP thành spec chi tiết.

## Nhận định
"Orchestrator" ở đây = **1 phiên agent độc lập** đào sâu 1 SP → spec chi tiết (khác L0 Orchestrator component).
**Phân tích ≠ implement.** Roadmap đã khoá hợp đồng xuyên suốt (D1–D6) nên SP-2/3/4 phân tích **song song** được — *với điều kiện coi hợp đồng SP-1 là cố định*. ⇒ **SP-1 là predecessor cứng**: nó đóng băng interface (`Tool`/`ctx`, `dispatch`, I/O orchestrator + shape event cho SP-4, biểu diễn turn/persistence cho SP-3, interface guardrail cho SP-2). Chạy 4-wide ngay từ đầu ⇒ 3 SP kia bịa giả định, SP-1 chốt khác ⇒ rework (vi phạm Rule 7).

## Kế hoạch: 1 → 3 (+1)
- **P1 (tuần tự, 1 orch):** SP-1 deep-dive. Output kèm "contracts" cho 3 SP sau trích dẫn.
- **P2 (song song, 3 orch):** SP-2 (actions & safety), SP-3 (memory & proactive), SP-4 (UX feedback) — đều ăn theo hợp đồng SP-1.
- **P2 (+1 reviewer, tùy chọn):** Integrator soát nhất quán interface chéo + gộp INDEX.

**Con số:** tối đa **3 orch song song hữu ích** (SP-2/3/4) sau **1 pass nền (SP-1)**; +1 reviewer ⇒ cao điểm 4 ở P2. Quá 4 vô ích (chỉ 4 SP, SP-1 là tiền đề). Không chẻ nội bộ SP-1 (coupling hợp đồng).

## Nút thắt thật (không phải số agent / sức máy)
1. **SP-1 là tiền đề.** 2. **Băng thông review của user** — 3 spec đổ về cùng lúc thì user/reviewer là điểm nghẽn. ⇒ "1→3" tối ưu hơn "4-wide".

## Giao thức phối hợp (chống giẫm chân)
- Mỗi orch ghi **file riêng**: `docs/superpowers/specs/2026-06-04-agent-harness-spN-*.md` + 1 file Serena `decisions/` riêng. Output tách biệt ⇒ merge ~zero-conflict.
- **Chỉ Integrator** đụng `INDEX.md`.
- Mọi SP trích dẫn hợp đồng SP-1; cần đổi hợp đồng ⇒ round-trip về chủ SP-1, không tự sửa (Rule 7).
- Bám [[agent-ops-rules]]: orch chỉ đọc + viết doc, không chạy ngầm service.

## Rủi ro & giảm thiểu
- Contract drift ⇒ P1 freeze + reviewer. SP-3 đụng schema (SP-1 chốt "không đụng schema") ⇒ ép SP-3 chỉ *additive*. Over-parallel vượt sức review ⇒ giữ 3-wide.

## Quyết định triển khai (user, 2026-06-04)
- Lưu plan này lên Serena ✅. **Main session (claude) đảm nhiệm SP-1** (P1). Fan-out P2 quyết định sau khi SP-1 đóng băng hợp đồng.
