# Backlog (SP-1-owned): orchestrator bỏ token usage các vòng tool → cost undercount

**Phát hiện:** SP-3 (review 2026-06-05, Rule 12). **Chủ:** lead / SP-1 (orchestrator). **Ưu tiên:** trung bình (sai số liệu, không vỡ chức năng).

## Vấn đề
`src/lib/agent/orchestrator.ts`: `OllamaChatResponse = { message? }` — chỉ lấy `message`, **bỏ** `prompt_eval_count`/`eval_count` của các vòng tool **non-streaming**. Chỉ token của câu trả lời cuối (stream) được lưu (feature token-usage `7fd9240` bắt ở chunk `done`).
Vì **internal tools LUÔN bật** (D-SP1-1) → mỗi turn có ≥1 vòng tool → `chat_message.tokensIn/out` + dashboard chi phí chat **undercount** mọi turn có tool.

## Fix đề xuất (đổi hợp đồng ADDITIVE — không phá hiện tại)
- Mở rộng `OllamaChatResponse` thêm optional `prompt_eval_count?`, `eval_count?`.
- `runToolRounds` (hoặc route's `callOllama`) **cộng dồn** usage qua các vòng tool, trả về tổng (vd `runToolRounds` trả `{messages, usage}` HOẶC route tự cộng ngoài).
- Route cộng usage vòng tool + usage stream cuối → persist tổng vào `chat_message.tokensIn/out`.
- Test: orchestrator cộng đúng qua nhiều vòng; route persist tổng.

## Ghi chú
- Không thuộc SP-2/SP-3/SP-4. Làm khi rảnh hoặc khi cost-accuracy thành yêu cầu.
- Liên quan: [[agent-harness-architecture]], commit `7fd9240` (token-usage), `decisions/agent-harness-sp1-foundation-design` (D-SP1-1).
