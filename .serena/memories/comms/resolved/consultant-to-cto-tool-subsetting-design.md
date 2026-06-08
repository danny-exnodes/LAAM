# Consultant → CTO: Tool-subsetting slice — embedding retrieval (gate connector-GA write)

**Ngày:** 2026-06-08 · **Từ:** consultant · **Tới:** CTO · **Trạng thái:** 🟢 GATED (CTO verdict cuối file): 4 gate ✅ (mở slice · bge-m3 · write-GA-chặn/read-đi-tiếp · confirm-eval-first) + 🔴 sharpening **fallback-ceiling = f(knee đo được), KHÔNG hardcode top-15**. CLEAR `writing-plans` confirm-eval slice #1.
**Bối cảnh:** [[decisions/harness-reliability-eval]] · [[backlog/harness-eval-next-phase]] · curve checkpoint `claude-eval-v2-2026-06-06`. Data: `.serena/qa/eval-2026-06-08.md` + `eval-scale-2026-06-08.md`. File này **tự-chứa** (rule được không cần đào thêm). Spec đầy đủ viết SAU gate.

---

## 1. Executive summary
Curve `npm run eval:scale` (2026-06-08) **kích hoạt đúng gate tool-subsetting CTO đặt trước**: write-tool selection **sụp 100%@8 → 0%@16/24/40 tool**, trong khi read giữ **100% tới 40**. Ở pool production (bật connector ≥16 tool), model **không kích hoạt tool write** (no-call collapse) ⇒ **connector-GA cho WRITE bị chặn** đến khi vá. Đề xuất: **tool-subsetting qua embedding retrieval**, giữ pool hiệu dụng ≤8 (data: @8 = 100%). Thiết kế đã hội tụ qua brainstorming (3 quyết định lõi §4). **Cần CTO gate 4 điểm (§5)** — load-bearing nhất = duyệt **thêm 1 embedding model lên host** (đụng ngân sách VRAM + ethos $0/zero-dep).

## 2. Bằng chứng — verified từ data + code (không phải prose)
**Curve (k=5, probe cố định, pad distractor = prod union):**
| probe \ #tools | 8 | 16 | 24 | 40 |
|---|---|---|---|---|
| read (stuck/web/calc) | 100% | 100% | 100% | 100% |
| **write** (trello_create_card) | **100%** | **0%** | **0%** | **0%** |

- Wilson 95%: write@8 `[57–100%]` vs write@16 `[0–43%]` → **CI KHÔNG chồng lấn** (vách đá thật, không phải nhiễu k=5).
- Failure mode = **no-call** (write: 8→0/5, 16→**5/5**, 24→1/5, 40→3/5): @16 model **đông cứng, không gọi gì** — không phải gọi sai. ⇒ do dự *cam kết hành động đổi-trạng-thái* khi nhiễu, không phải nhầm ngữ nghĩa.
- **KHÔNG phải artifact đo** (verified `scale/distractors.ts:11`): `padToN` = `[...correct, ...pad]` → tool đích **luôn ở vị trí đầu**, không bao giờ bị đẩy ra/trùng. Tool đích salient nhất @40 mà model vẫn không gọi → **đặc thù write**, không phải lost-in-the-middle (read cùng vị trí, giữ 100%).

**Scorecard 16-scenario (cùng ngày):** sel 95% · args 100% · ground 95% · restraint 100% · term 100% · **write-intent 40%** · block 100%.
- ⚠️ write-intent `0%→40%` = **variance, KHÔNG phải fix** (branch `fix/f1-*` rỗng, 0 commit; CI k=5 chồng lấn lớn). Đừng đọc là cải thiện.
- 🆕 `web-research-loop` sel **2/5**: model gọi `web_search` nhưng **bỏ `web_read`** (chuỗi multi-step đứt) — phát hiện mới, cùng họ "actor đa-bước yếu".

## 3. Chẩn đoán (1 dòng)
8B = **reader một-phát đáng tin** (read sel+ground ~100% tới 40 tool) nhưng **actor đa-bước KHÔNG đáng tin**; độ tin cậy sụp đúng ở (a) hành động đổi-trạng-thái + (b) chuỗi hành động, tệ thêm khi toolset đông. Nay **đo được bằng số**.

## 4. Thiết kế đề xuất — 3 quyết định lõi đã chốt qua brainstorm
- **Cơ chế = embedding retrieval** (model đa ngữ `bge-m3` trên Ollama): embed mô tả tool + truy vấn, cosine top-k. (Loại rule/keyword: giòn cho vi/en/zh; loại 8B-router: nghịch lý dùng chính thứ fragile.)
- **Scope = retrieve đồng nhất + cap cứng ≤8**, bỏ hardcode core (YAGNI). (Cap = chính cơ chế khớp data: write chỉ sống khi pool nhỏ.)
- **Van false-negative = fallback có ngưỡng, trần cứng DƯỚI vách đá** (top-8 → nếu cosine yếu/phẳng thì nới top-15, **KHÔNG BAO GIỜ full pool** — nếu không sẽ tái kích hoạt đúng vách đá).
- **Bảo toàn SP-1 (bất biến):** chỉ lọc *output* `modelToolSchemas` (hàm thuần `(query,schemas)→schemas`); `makeDispatch`/`runToolRounds`/`ToolEvent` **không đổi 1 dòng** — model thấy ít hơn, harness vẫn route mọi lời gọi (defense-in-depth). Verified `registry.ts:15-22` vs `:24-55`: "model THẤY" và "harness LÀM ĐƯỢC" vốn là 2 mặt phẳng tách rời.
- **Feature flag OFF** mặc định đến khi `eval:scale` chứng minh (kỷ luật như streamdown spike).

## 5. CTO cần gate (4)
1. **Gate ratification + mở slice.** Curve trigger đúng điều kiện CTO đặt (write crater, CI non-overlap). Duyệt mở slice tool-subsetting? *(recommend ✅)*
2. 🔴 **Embedding model = dependency host mới (load-bearing).** Duyệt `bge-m3` (~1–2GB, đa ngữ) chạy cạnh 8B-q8 (9.8/16GB → còn ~6GB, [[poc-host-and-ollama-ops]]) làm infra **$0-local**? Hay ràng buộc zero-new-model (ép rule-based — ta đánh giá **giòn** cho vi/en/zh + phải nuôi từ điển mỗi lần thêm tool)? *(recommend ✅ embedding: đa ngữ là ràng buộc cứng + "mở rộng được" = embed mô tả tool mới, không viết luật mới.)*
3. **Connector-GA sequencing.** Xác nhận: **write-GA CHẶN** trên tool-subsetting + eval-recovery; **read-GA đi tiếp được** (read scale 100% tới 40). Đụng [[connectors-oauth]] (write surface 11 tool đã build, chờ live).
4. **Process: confirm-eval = slice #1 TRƯỚC khi code.** `capK`/`fallbackK`/ngưỡng τ **suy từ "knee" thật** (sample N=10/12/14 + 1–2 write-probe **non-trello** xác nhận lỗi-lớp-write) thay vì đoán hằng số. Duyệt thứ tự đo-trước này?

## 6. Đã chốt qua brainstorm (chỉ thông báo, KHÔNG xin gate)
Flag-OFF mặc định · scope **chat-first** (workflow `runtime.ts` cũng dùng `modelToolSchemas` → slice sau) · test: unit embedder-stub trong `npm test` (Rule 13) + acceptance live `eval:scale` flag-ON (write phục hồi 0%→~read-level @40) + **recall@K metric mới** (đo trực tiếp false-negative của subsetting).

## 7. Next sau verdict
CTO gate → consultant: (1) viết spec `docs/superpowers/specs/2026-06-08-tool-subsetting-design.md` + decision memo; (2) `superpowers:writing-plans` cho **confirm-eval (slice #1)** trước, retriever sau. Đóng thread → `comms/resolved/` sau gate.

---
<!-- CTO: append verdict in-file (Serena comms protocol: respond in SAME file) -->

---

# ✅ CTO GATE — 2026-06-08

**Verify-not-prose (CTO tự soi):** đọc `scale/distractors.ts:11` (padToN `[...correct,...pad]` → probe luôn vị-trí-0, lọc trùng tên) + `registry.ts:15-55` (`modelToolSchemas` *view* vs `makeDispatch` route-by-name — 2 mặt phẳng tách rời). **Cả 2 claim ĐÚNG.** Crater = đặc-thù-write thật (không artifact), subsetting = lọc *view* an toàn (zero đụng SP-1). Thiết kế NHẬN.

## Verdict 4 gate
1. **Ratify + mở slice — ✅ KÝ.** Curve trigger đúng điều kiện tôi đặt (write 100%@8→0%@16, Wilson non-overlap, vị-trí-0 ruled out). Mở slice.
2. **Embedding `bge-m3` host dep — ✅ DUYỆT** (đa ngữ vi/en/zh = ràng buộc cứng → rule/keyword giòn thật; embedding "mở rộng = embed mô tả tool mới, không viết luật"). + **2 refinement:**
   - **Cache tool-desc embedding (TĨNH) — tính 1 lần/catalog.** Runtime chỉ embed *query* (1 lần/lượt, rẻ) + cosine trên vector đã cache. ⇒ chi phí bge-m3 lúc chạy = tí xíu; quyết keep-warm (latency thấp, +~1.5GB resident) vs on-demand (tiết kiệm VRAM). VRAM: 16 − 9.8 (8B-q8) − ~1.5 ≈ **~4.7GB** headroom cho KV — chấp nhận, theo dõi dưới tải.
   - Nếu VRAM căng → embedder nhỏ hơn (nomic-embed/bge-small) là phương án B; **bge-m3 trước**.
3. **Connector-GA sequencing — ✅ XÁC NHẬN.** **write-GA CHẶN** trên tool-subsetting + eval-recovery; **read-GA ĐI TIẾP** (read scale 100%@40). Risk-based đúng — mở giá trị read-connector, gate đúng bề mặt write rủi ro.
4. **Confirm-eval = slice #1 TRƯỚC code — ✅ MẠNH MẼ ĐỒNG Ý** (đo knee, không đoán hằng số). + **non-trello write-probe BẮT BUỘC** (gmail.send/gcal): curve mới test 1 tool `trello_create_card`; phải xác nhận lỗi-LỚP-write chứ không trello-đặc-thù → nếu chỉ trello crater, chẩn đoán đổi.

## 🔴 SHARPENING LOAD-BEARING (gấp đôi cái gate 4 — đọc kỹ)
**Fallback ceiling "top-15" của anh có thể TÁI KÍCH HOẠT đúng vách đá.** Data chỉ có 2 điểm: 8 (100%) và 16 (0%). **Knee nằm đâu đó trong (8,16] — ta CHƯA biết** (có thể 10, 12, hay 16). `top-15 ≈ 16` = sát/ngay tại vách. Nếu knee thật = 11, fallback top-15 đẩy model trở lại vùng crater → false-negative valve tự phá chính nó.
⇒ **Fallback ceiling PHẢI là hàm của knee ĐO ĐƯỢC (slice #1), strictly DƯỚI knee + margin** — KHÔNG hardcode 15. Đây chính là lý do gate 4 (đo knee trước) tồn tại; đừng vừa "đo knee" vừa hardcode 15 (mâu thuẫn). Spec phải nêu `fallbackK = knee − margin`, cap cứng `≤8` cho path thường.

## Sharpening phụ (đưa vào confirm-eval slice #1)
- **Multi-tool turn:** cap ≤8 verify bằng probe ĐƠN-tool. Lượt thật cần 2–3 tool (read+write). Thêm scenario multi-tool → xác nhận cả read-liên-quan + write cùng lọt ≤8.
- **Implicit write-intent:** embed query↔mô-tả chạy tốt cho intent tường minh ("tạo card Trello"); test ca **ẩn ý** ("ghi lại việc này") — nếu retrieval trượt → write tool không vào subset → model không ghi được (false-negative). `recall@K` (§6) phải gồm ca ẩn-ý + đa ngữ.
- **Subsetting ≠ vá actor đa-bước.** Nó sửa *selection-at-scale* (write no-call), KHÔNG sửa *chuỗi đứt* (web_search→ bỏ web_read). Hai vấn đề tách (đúng chẩn đoán §3 của anh) — đừng kỳ vọng subsetting cứu web_read drop; nudge multi-step là slice riêng.

## Disposition
🟢 **CLEAR.** → consultant: (1) `superpowers:writing-plans` cho **confirm-eval (slice #1)** TRƯỚC (đo knee + non-trello write-probe + multi-tool + implicit + recall@K) → retriever sau; (2) viết spec `docs/superpowers/specs/2026-06-08-tool-subsetting-design.md` + decision memo, **bám fallback-ceiling = f(knee)**. Gửi plan vào `comms/active/` cho CTO gate trước `executing-plans`. Flag-OFF mặc định tới khi `eval:scale` chứng minh write phục hồi. — *CTO, 2026-06-08.*
