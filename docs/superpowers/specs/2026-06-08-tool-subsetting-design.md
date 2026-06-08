# Tool-Subsetting via Embedding Retrieval — Design Spec

**Ngày:** 2026-06-08 · **Vai trò:** technical consultant · **Trạng thái:** CTO-gated (design) — chờ plan-gate trước `executing-plans`.
**Gate:** `comms/resolved/consultant-to-cto-tool-subsetting-design.md` (🟢 CLEAR, CTO 2026-06-08).
**Liên quan:** [[harness-reliability-eval]] · [[harness-eval-next-phase]] · [[connectors-oauth]] · [[poc-host-and-ollama-ops]] · [[agent-harness-sp2-actions-safety]] · backlog [[harness-write-tool-subsetting]].
**Data:** `.serena/qa/eval-2026-06-08.md` + `eval-scale-2026-06-08.md` (gitSha 75bea85, qwen3-vl:8b-instruct-q8_0, k=5).

---

## 1. Vấn đề
Curve `npm run eval:scale` cho thấy **write-tool selection sụp 100%@8 → 0%@16/24/40 tool** (Wilson 95%: @8 `[57–100%]` vs @16 `[0–43%]`, **CI không chồng lấn**), trong khi read (stuck/web/calc) **giữ 100% tới 40**. Failure mode = **no-call** (@16: 5/5 run model không gọi tool nào). Đã loại artifact đo: `padToN` luôn giữ tool đích ở vị trí đầu → đặc thù **write**, không phải lost-in-the-middle. Ở pool production (bật connector ≫16 tool), local 8B **về cơ bản không bao giờ** chọn đúng tool write.

## 2. Mục tiêu / Phi mục tiêu
**Mục tiêu:** Thu nhỏ tập schema model nhìn thấy xuống **≤8 tool liên quan/lượt** → khôi phục write selection ở quy mô production, đo lại bằng `eval:scale`.
**Phi mục tiêu (tách bạch rõ — theo CTO):**
- ❌ KHÔNG sửa **confabulation** ("bịa đã tạo"). Runtime `write-claim-guard` + Confirm Card **đã trung hoà** việc này (QA verified live, cả 2 path). Slice này sửa **SELECTION**, không phải narration.
- ❌ KHÔNG sửa **actor đa-bước** (`web_search`→bỏ `web_read`). Đó là *chuỗi đứt*, vấn đề tách → nudge multi-step là slice riêng.
- ❌ KHÔNG đổi hợp đồng SP-1; KHÔNG nới safety-gate; KHÔNG auto-deploy (flag-OFF tới khi eval xanh).

## 3. Cách tiếp cận (3 quyết định lõi, CTO-gated)
1. **Cơ chế = embedding retrieval.** Model đa ngữ `bge-m3` (Ollama) embed mô tả tool + truy vấn → cosine top-k. *(Loại rule/keyword: giòn cho vi/en/zh + nuôi từ điển mỗi lần thêm tool. Loại 8B-router: dùng chính thứ fragile.)*
2. **Scope = retrieve đồng nhất + cap cứng ≤8**, bỏ hardcode core (YAGNI).
3. **Van false-negative = fallback có ngưỡng, trần STRICTLY DƯỚI knee.** Xem §6 — **trần KHÔNG hardcode**.

## 4. Kiến trúc & luồng dữ liệu
```
request → modelToolSchemas(INTERNAL_TOOLS, connectorTools)   [full ~40, NHƯ CŨ]
            │
            ▼  NEW: selectTools(query, fullSchemas) → subset ≤ capK (≤ fallbackK khi low-confidence)
            ▼
        runToolRounds(subset)            [model CHỈ thấy subset]
        makeDispatch(INTERNAL_TOOLS,…)   [GIỮ FULL — route mọi lời gọi, NHƯ CŨ]
```
Verified `registry.ts:15-22` (`modelToolSchemas`) vs `:24-55` (`makeDispatch`): "model THẤY" và "harness LÀM ĐƯỢC" vốn 2 mặt phẳng tách rời → lọc 1 chỗ, dispatch bất biến.

## 5. Thành phần (module `src/lib/agent/tool-retrieval/`)
- **`embedding-client.ts`** — `embedQuery(text)`, `embedTexts(texts[])` qua Ollama embeddings API; reuse config Ollama sẵn có; model = env (`TOOL_RETRIEVAL_EMBED_MODEL`, default `bge-m3`).
- **`tool-embedding-cache.ts`** — embed `name + description` mỗi tool **TĨNH, 1 lần cho TOÀN catalog code-defined** (`INTERNAL_TOOLS` + mọi tool trong `CONNECTORS` registry — định nghĩa tĩnh dù connector per-user). **Cache key = hash CHUỖI ĐÃ EMBED (name+description)** (R1: sửa description mà không re-embed = vector lạc; KHÔNG key theo tool-count/identity). Per-request **chỉ LỌC** xuống subset user thấy — đều đã có embedding sẵn (R2: KHÔNG cache per-request-set → tránh thrash theo tổ hợp connector). Warm lúc boot, runtime **chỉ embed query**.
- **`selector.ts`** — `selectTools(query, schemas, opts) → schemas` (hàm thuần): embed query → cosine vs cache → top-k → confidence-gate → trả **đúng object schema gốc**.
- **`config.ts`** — flag `TOOL_RETRIEVAL` (default **OFF**), `capK`, `fallbackK`, `tau`, model name.

## 6. Thuật toán retrieval — trần fallback = f(knee) ⚠️ LOAD-BEARING
1. `embedQuery(userMessage)`; cosine với từng tool-embedding cache.
2. Sort giảm dần, lấy **top-`capK`** (path thường).
3. **Confidence gate:** nếu cosine top-1 < `tau` *hoặc* phân bố "phẳng" — đo bằng **metric cụ thể** (vd gap `top1 − top_capK`, hoặc variance top-k), **tune ở slice #1 KHÔNG hardcode** (R5) — → nới tới **top-`fallbackK`**, **KHÔNG BAO GIỜ full pool**.

**Bất biến (CTO sharpening):**
- `capK ≤ 8` — hằng số an toàn DUY NHẤT được hardcode (data: @8 = 100%).
- **`fallbackK = knee − margin`** — suy từ knee ĐO ĐƯỢC ở slice #1, **strictly dưới knee**. KHÔNG hardcode 15 (15≈16 = ngay vách; nếu knee=11 thì 15 tái kích hoạt crater → van tự phá). Tới khi đo xong knee, `fallbackK` **chưa định nghĩa được** — đó là lý do confirm-eval là slice #1.
- `tau` — tuned từ phân bố cosine quan sát ở slice #1, không đoán.

| Hằng số | Giá trị | Nguồn |
|---|---|---|
| `capK` | ≤8 | data curve (@8=100%) — hardcode an toàn |
| `fallbackK` | `knee − margin` | **slice #1 đo knee** (chưa biết) |
| `tau` | đo ở slice #1 | phân bố cosine quan sát (vd gate khi gap top1−top_capK nhỏ) |

## 7. Bảo toàn hợp đồng SP-1
`selectTools` thuần `(query, schemas) → schemas`, chỉ lọc *output* `modelToolSchemas`. `makeDispatch`/`runToolRounds`/`ToolEvent` **không đổi 1 dòng**. Lỡ model gọi tool ngoài subset → dispatch vẫn route (defense-in-depth).

## 8. Xử lý lỗi (fail loud)
- **Embedder chết/timeout** → fallback full pool + **emit cảnh báo** (`ToolEvent` + log); tái lộ vách nhưng không gãy read; operator thấy → tắt flag. KHÔNG im lặng.
- **Cache lạnh** → embed catalog 1 lần (warm boot né latency lượt đầu).
- **Query rỗng/chào** → confidence thấp → nới fallback; chit-chat vốn không cần tool (restraint 100%).

## 9. VRAM (host RTX 5070 Ti 16GB)
8B-q8 = 9.8GB; `bge-m3` resident ~1.5GB → **~4.7GB headroom KV** (chấp nhận, **theo dõi dưới tải**). Embedding tool-desc tĩnh nên chi phí runtime = embed 1 query/lượt (tí xíu). VRAM căng → **plan B `bge-small`/`nomic-embed`**; `bge-m3` trước.
**Ops (R3):** đặt Ollama `keep_alive` cho `bge-m3` để **resident** — nếu Ollama unload (memory pressure), query-embed lượt sau **cold = chậm giây**. Ghi vào env/runbook.

## 10. Test & nghiệm thu
**Unit (`npm test`, tất định):** `selector` với **embedder STUB** (tiêm vector có kiểm soát — Rule 13, không echo) — top-k, gate nới đúng, **trần fallback không bao giờ = full / không bao giờ vượt `fallbackK`**, schema-object giữ nguyên, cosine math.

**Confirm-eval = SLICE #1 (host, TRƯỚC code retriever):**
- **Đo knee:** sample N = 8/**10**/**12**/**14**/16 → tìm điểm write bắt đầu sụp → đặt `fallbackK`/`tau`.
- **Non-trello write-probe BẮT BUỘC** (`gmail_send`/`gcal_*`): xác nhận lỗi **LỚP write**, không trello-đặc-thù. *(Nếu chỉ trello crater → chẩn đoán đổi.)*
- **Multi-tool turn:** scenario cần read+write cùng lúc → xác nhận cả hai lọt ≤ `capK` (cap ≤8 hiện chỉ verified bằng probe đơn-tool).
- **Implicit write-intent + đa ngữ:** ca ẩn ý ("ghi lại việc này" thay vì "tạo card Trello") + vi/en/zh → vào **`recall@K`**.
- **`recall@K` metric (mới):** mỗi scenario — tool đúng có lọt subset không? Đo trực tiếp false-negative của subsetting, tách khỏi hành vi model.

**Net-trade (R4 — load-bearing):** subsetting KHÔNG xoá false-negative, nó **DỜI** từ "model ngợp toolset" → "retrieval miss". v1 **chưa có lưới runtime** cho genuine miss (2-pass hoãn §11) → chấp nhận + ĐO. ⇒ nghiệm thu phải chứng minh **cược `miss-rate(recall@K) ≪ crater-rate`**, KHÔNG chỉ "write phục hồi". **Hai thước CÙNG phải đạt:** (a) write-recovery `eval:scale` @40 + (b) `recall@K` đủ cao (đặc biệt ca implicit + đa ngữ).

**Live acceptance (`eval:scale`, flag ON):** write probe **phục hồi 0% → ~read-level @40**. KHÔNG ship connector-write GA tới khi curve phục hồi **VÀ** recall đạt ngưỡng.

## 11. Phân lát
1. **Confirm-eval** (đo knee + non-trello + multi-tool + implicit + recall@K) → khoá `fallbackK`/`tau`.
2. Retriever (embedding-client + cache + selector) + **unit test TDD**.
3. Tích hợp `/api/chat` sau **flag OFF**.
4. `eval:scale` flag ON → chứng minh phục hồi + recall metric.
5. *(sau)* path workflow (`runtime.ts` cũng dùng `modelToolSchemas`); enhancement 2-pass; multi-step nudge (vấn đề tách).

## 12. Connector-GA sequencing (CTO-confirmed)
**write-GA CHẶN** trên slice này + eval-recovery; **read-GA đi tiếp** (read scale 100%@40).

---

## 13. CTO Spec Review — ✅ APPROVE (2026-06-08)
Soi chéo cả 10 ràng buộc đã gate → spec **honor toàn bộ**, đặc biệt §6 fallbackK=f(knee) fold đúng + giải thích. Verify `registry.ts:15-22/24-55` seam (đã verify ở gate). **Clear → `writing-plans` confirm-eval slice #1.** 5 refinement (fold vào spec/plan, KHÔNG chặn):

- **R1 (cache correctness):** key cache phải hash **nội-dung-embed (name+description)**, không chỉ tool-identity/count — sửa description tool mà không re-embed = embedding lạc. Hash phải gồm chuỗi đã embed.
- **R2 (cache scope — tránh thrash per-user):** `connectorTools` là **per-user** (connector user đã nối), nhưng *định nghĩa* mọi connector tool là **tĩnh trong `CONNECTORS` registry**. ⇒ cache embed **toàn catalog code-defined (INTERNAL + mọi CONNECTOR tool)** 1 lần; per-request chỉ *lọc* tới subset user thấy (đều đã có embedding). Đừng cache theo per-request-set (thrash theo tổ hợp connector).
- **R3 (ops — keep_alive):** §5 "warm boot" đúng, nhưng phải set Ollama **keep_alive cho `bge-m3`** để nó **resident** — nếu Ollama unload nó (memory pressure), query-embed lượt sau **cold = chậm giây**. Nêu trong env/runbook.
- **R4 (đóng khung trade thật):** subsetting KHÔNG xoá false-negative — nó **DỜI** từ "model ngợp toolset" sang "retrieval miss". v1 KHÔNG có lưới-an-toàn runtime cho genuine miss (2-pass hoãn §11) → chấp nhận + ĐO. Cược load-bearing = **miss-rate(retrieval) ≪ crater-rate**; `recall@K` + acceptance `eval:scale` PHẢI chứng minh cược này, không chỉ "write phục hồi". Nêu rõ net-trade trong nghiệm thu.
- **R5 (gate "phẳng" cụ thể):** §6 "phân bố phẳng" cần metric đo-được (gap top1−top_capK / variance) — tune ở slice #1, không đoán. (Spec đã ghi hướng; confirm là **đo** không hardcode.)

**Disposition:** spec design APPROVED. Plan confirm-eval (slice #1) gửi `comms/active/` cho CTO gate trước `executing-plans`; fold R1–R5. — *CTO, 2026-06-08.*

---
### Consultant — FOLDED R1–R5 (2026-06-08)
- **R1+R2** → §5 cache: key = hash(name+description); embed TOÀN catalog code-defined 1 lần, per-request chỉ lọc (không thrash per-user).
- **R3** → §9: Ollama `keep_alive` resident cho bge-m3 (env/runbook).
- **R4** → §10: net-trade `miss-rate ≪ crater-rate`; nghiệm thu = recall@K **VÀ** write-recovery (không chỉ recovery).
- **R5** → §6: flat-gate = metric đo được (gap top1−top_capK / variance), tune slice #1.
**Next:** `superpowers:writing-plans` cho confirm-eval slice #1 → plan vào `comms/active/` cho CTO plan-gate.
