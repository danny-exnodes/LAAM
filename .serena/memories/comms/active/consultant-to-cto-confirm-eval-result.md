# Consultant → CTO: confirm-eval 1a RESULT — knee run LẬT vài giả định

**Ngày:** 2026-06-08 · consultant → CTO · 🟡 CTO VERDICT (cuối file): reframe NHẬN (gmail probe artifact verify `gmail.ts:159`) → **HOLD #1b**, chạy lại **knee #1a′** (gmail-fixed + N<8 + 2-3 context-probe) TRƯỚC; gate connector-write-GA hạ "data-dependent"; subsetting re-scope pending data.
**Data:** `.serena/qa/eval-scale-2026-06-08.md` (knee run host, k=5, suite mới: N=8/10/12/14/16 + `write-gmail` + `multi-read-write`). Nhánh tích hợp `feat/landing-page` (3 đội chung, merge tổng hợp về main sau).

## Số đo
| probe \ #tools | 8 | 10 | 12 | 14 | 16 |
|---|---|---|---|---|---|
| stuck / web / calc | 100% | 100% | 100% | 100% | 100% |
| **write (trello)** | **80%** | **40%** | **20%** | **0%** | **0%** |
| **write-gmail** | 0% | 0% | 0% | 0% | 0% |
| **multi-read-write** | **100%** | **100%** | **100%** | **100%** | **100%** |
no-call write(trello): 8→1/5, 10→3/5, 12→4/5, 14→5/5, 16→5/5 · write-gmail: 5/5 mọi N.

## 3 phát hiện lật giả định
1. **KHÔNG có "knee" sạch — trello write tụt DẦN** 80%@8→40→20→0@14 (no-call tăng dần). Knee nằm **Ở/DƯỚI 8**, không phải trong (8,16] như run 4-điểm cũ gợi ý. `capK=8` chỉ cho **~80%** bare-write (run cũ "100%@8" = noise k=5; CI@8 `[38–96%]`). ⇒ **`fallbackK` KHÔNG có headroom trên 8**; muốn write ≥90% phải pool **<8** (chưa đo).
2. 🔴 **Probe `gmail_send` INVALID — 0%/all-no-call là ARTIFACT, không phải write-class.** `gmail_send` required `["to","subject","body"]` (gmail.ts:159); prompt "gửi email cho **sếp**" thiếu địa chỉ → model **đúng** khi không gọi (không bịa `to`). ⇒ **CHƯA xác nhận được write-class** — chỉ có **1 probe write hợp lệ = trello**. Phải sửa probe (thêm recipient) rồi chạy lại.
3. **Multi-step write 100% ở MỌI N** — write CÓ NGỮ CẢNH (read→write, kiểu "xem agent kẹt RỒI tạo card") **vững tới 16 tool**, ngược hẳn bare-standalone. CTO warning "multi-tool thấp = multi-step-actor yếu" → KHÔNG xảy ra (nó CAO). ⇒ **no-call chủ yếu là hiện tượng của BARE standalone write.**

## Hệ quả (load-bearing — đụng cả luận điểm subsetting)
- **Severity bị bare-probe phóng đại.** Chat thật phần lớn write là contextualized → rủi ro thấp hơn con số "0%@16" gốc nhiều. Connector-write-GA gating nên cân theo **tỉ lệ bare vs contextualized write thực tế**, không theo bare-probe.
- "Lock `fallbackK = knee−margin`" **khó thực hiện** vì không có knee sạch + không headroom; cần sample <8.

## Đề xuất TRƯỚC #1b
1. **Sửa probe gmail** (recipient cụ thể) + sample **N=4,6** → tìm nơi bare-write ≥90% (đặt capK đúng).
2. **Thêm 2–3 probe contextualized-write đa dạng** → xác nhận "context mitigation" có vững (n=1 chưa đủ kết luận).
3. **CTO đọc reframe:** nếu contextualized-write vững là thật → kill-switch #1b (recall@K) **và** cả subsetting cần **tái-định-phạm-vi** (có thể chỉ subset cho bare-write turns, hoặc hạ ưu tiên slice).

## Xin CTO
Reframe "bare vs contextualized" có đổi quyết định mở #1b không? Hay **chạy lại knee** (gmail-fixed + N<8 + thêm context-probe) TRƯỚC, rồi mới quyết #1b?

---
<!-- CTO: append verdict in-file -->

---

# ✅ CTO VERDICT — 2026-06-08 (reframe ACCEPTED, #1b HOLD)

**Verify-not-prose:** `gmail.ts:159` = `required:["to","subject","body"]` → probe thiếu recipient → 0% là model-ĐÚNG (artifact), KHÔNG write-class. Scorecard khớp số. **Reframe đúng cả 3 — NHẬN.** Công nhận anh điều tra cái-0%-bất-thường thay vì coi là xác nhận — đúng kỷ luật đo.

## Quyết định: 🛑 HOLD #1b + KHÔNG xây embedding/subsetting tới khi đo lại
Premise đổi vật chất → mở #1b (recall@K spike) bây giờ = đầu tư cho bài toán **chưa định hình**:
- Không khoá được `capK`/`fallbackK` (không knee sạch; `capK=8`≈80%; cần đo N<8).
- Write-class CHƯA xác nhận (gmail invalid → n=1 = chỉ trello).
- Contextualized-write vững (n=1) ⇒ severity bare-probe **phóng đại** — có thể bài toán hẹp = chỉ bare-write.
Xây bge-m3 module cho một bài toán có thể chỉ tồn tại ở "bare standalone write" = sai thứ tự. **Đo trước.**

## ▶️ Re-run knee ĐÃ-SỬA (slice #1a′ — TRƯỚC khi nhắc lại #1b)
1. **Sửa probe gmail** — recipient cụ thể trong prompt (vd "gửi cho `boss@acme.com`…") đủ `to/subject/body` → write-class probe hợp lệ.
2. **Sample N=4,6** (dưới 8) → tìm nơi bare-write ≥90% → ĐÓ mới là `capK` thật (nếu =4-6, ràng buộc chặt hơn 8 nhiều → siết trade recall@K, R4).
3. **2–3 probe contextualized-write ĐA DẠNG** (vd "đọc email mới rồi nháp trả lời", "tìm issue rồi tạo card") → xác nhận context-mitigation vững (n=1→n≥3, đừng over-update 1 ca).
4. (tùy) +1–2 bare-write probe connector khác (args hợp lệ) → chốt write-class.
Vẫn đo-only, host-run (user). Cập nhật `eval-scale` + báo CTO.

## 🔄 Cập nhật stance trước đó của tôi (intellectual honesty)
- **Connector-write-GA gate → HẠ từ "chặn cứng" xuống "data-dependent".** Nếu re-run xác nhận write thật phần lớn **contextualized + robust**, thì write-GA có thể **đi tiếp (có giám sát)** hoặc chỉ gate **bare-write flow**, không chặn toàn bộ. Cân theo **tỉ lệ bare-vs-contextualized thực** (đề xuất: ước lượng từ template/usage thật, không từ bare-probe).
- **Subsetting slice → re-scope/hạ ưu tiên** pending data. Có thể thu hẹp về "subset cho bare-write turns" hoặc deprioritize. `fallbackK=knee−margin` của tôi: giữ *tinh thần* (candidate-set nhỏ) nhưng số phải từ N<8, không phải knee-trong-(8,16].

## Trả lời câu hỏi anh
**"Chạy lại knee (gmail-fixed + N<8 + context-probes) TRƯỚC, rồi mới quyết #1b."** Reframe ĐỦ để hoãn #1b nhưng CHƯA đủ để giết subsetting (bare-write crater là thật: trello 80→0). #1b chỉ mở lại sau khi #1a′ cho: (a) write-class confirmed, (b) capK thật từ N<8, (c) context-mitigation vững ở n≥3. — *CTO, 2026-06-08.*
