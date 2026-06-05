# Backlog (IDEA — bàn sau): Đóng vòng eval → tự cải thiện agent (L1/L2)

> **Trạng thái:** ý tưởng, user chốt "lưu lại, bàn sau" (2026-06-05). CHƯA spec, CHƯA làm.
> **Nguồn:** thảo luận cuối phiên eval. Liên quan: `decisions/harness-reliability-eval.md` · `backlog/harness-eval-next-phase.md` · eval harness PR #2 · trang `/eval`.

## Bối cảnh / câu hỏi gốc
"Sau khi chạy eval, agent có TỰ ĐỘNG tốt hơn không?" → **Hiện KHÔNG.** Eval chỉ ĐO (read-only thermometer) + ghi scorecard/`eval_run`. Cải thiện hiện là **human-in-the-loop**: người đọc scorecard → đổi prompt/tool/skill → re-eval.

## Insight then chốt (đừng quên khi bàn lại)
Model `qwen3-vl:8b` **cố định** (không fine-tune; local, $0). ⇒ **"agent tốt hơn" = lớp HARNESS cải thiện** (system prompt / tools / skills / few-shot), KHÔNG phải đổi trọng số model. ⇒ "tự cải thiện" thực chất = **auto-tune các knob của harness**, với **eval làm hàm fitness**, người duyệt deploy.

## Phổ tự-động-hoá (đã phác)
- **L0 Manual** (hiện tại): người đọc scorecard → sửa → đo lại. An toàn nhất.
- **L1 Assisted** (nhẹ, an toàn): hệ thống *gợi ý* dim yếu + giả thuyết fix (model tóm tắt scorecard). Người vẫn quyết + áp dụng. Chỉ phân tích, không hành động.
- **L2 Auto-tune có rào** (feature mạnh, "wow" đầu tư): tự thử **biến thể prompt/few-shot** trong sandbox, **eval = fitness**, chọn bản tốt nhất. RÀO: chỉ tune knob an toàn (prompt/few-shot/tool-desc), **KHÔNG đụng safety-gate**, **KHÔNG auto-deploy** (người duyệt + eval xanh mới lên prod).
- **L3 Tự trị hoàn toàn** (agent tự viết+deploy tool/prompt): ❌ nguy hiểm cho 8B + vi phạm Rule 5/safety — KHÔNG làm.

## Khi bàn lại — gợi ý
- Bắt **L1 trước** (rẻ, an toàn, giá trị ngay) rồi cân nhắc L2.
- **Trục "skills"** = knob mà L2 auto-tune; **eval = fitness**. Eval + skills + auto-tune ghép thành "self-improving-within-bounds".
- Rào bất biến mọi mức: **không auto-tune nới safety-gate** (baseline đã chứng minh model bịa "đã tạo" → gate phải cứng); mọi thay đổi prompt/tool lên prod **qua người duyệt**.
- Giao thoa trục **schedule** (cron tự chạy eval định kỳ) + trục **skills** của roadmap.
