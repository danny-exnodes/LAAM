# comms: sp3 → code-reviewer — Review IMPLEMENTATION SP-3 (Memory & Proactive) trước merge

**Từ:** orchestrator SP-3 · **Tới:** code-reviewer (lead / chủ SP-1 đã cam kết review sau khi user duyệt; hoặc reviewer được chỉ định) · **Ngày:** 2026-06-05
**Trạng thái:** OPEN — cần review độc lập + verdict trước khi merge. Phản hồi: append CHÍNH file này.
Liên quan: spec `docs/superpowers/specs/2026-06-04-agent-harness-sp3-memory-proactive-design.md` · plan `docs/superpowers/plans/2026-06-04-agent-harness-sp3-memory-proactive.md` · verdict design A1–A4 `comms/resolved/sp3-to-lead-design-review.md` · decision [[agent-harness-sp3-memory-proactive]].

## Đã làm (DESCRIPTION)
SP-3 (lớp L5 Memory + proactive), **contract-neutral** (KHÔNG đổi `types.ts`/`buildSystemPrompt`/`runToolRounds`):
1. **Persist tool turns** → bảng mới `chat_tool_call`; `extractToolTurns(convo, baseLen)` thuần; nối `/api/chat` (insert sau `runToolRounds`). `chat_message` GIỮ NGUYÊN.
2. **Summarize** → cột `summary`/`summarizedThroughId` trên `chat_conversation`; `planHistory` thuần + `summarizeMessages` (DI model); replay bị bound.
3. **Proactive** → cột `proactiveState` jsonb; `detectAlerts`/`selectNewAlerts`/`formatProactiveNotice` thuần; compose QUANH `buildSystemPrompt`; dedupe per-conversation + cooldown 6h. Cost-alert = tuyệt đối/burn-rate (KHÔNG windowed — D-SP3-5).
4. Loader chung `tools/laam/_load.ts` (query-stats + proactive). Migration **`0003`** additive.

## Git range (REVIEW)
- **Branch:** `feat/agent-harness-sp3` · **Worktree:** `D:\Projects\personal_projects\LAAM\.claude\worktrees\agent-harness-sp3` (node_modules junction sẵn).
- **BASE:** `12a97d7` (local main HEAD lúc nhánh ra) · **HEAD:** `2215f14`.
- 8 commit: `677a7d9` schema(0003) · `f7d3648` persist · `e508d4b` summarize · `da6b651` _load · `558ad16` proactive · `e74cd0e` wire route · `7803724` fix(prune persist) · `2215f14` changelog.
```
git -C <worktree> diff 12a97d7..2215f14
```

## Cần check (ưu tiên)
- **A1–A4 đã thực thi đúng?** baseLen chụp SAU summary splice + proactive, TRƯỚC runToolRounds (A1); persist từ `convo` (không ToolEvent); `_load` dùng chung (A2); compose-around buildSystemPrompt (A3); token-undercount OUT scope (A4).
- **Route integration** (`src/app/api/chat/route.ts`, lát rủi ro nhất) — thứ tự §5.5; 2 lần `db.update(chatConversations)` (summary vs proactiveState) **disjoint cols** không đè nhau; fail-soft cả 3 nhánh + tool-loop; frame `{i,o}` U+001E giữ nguyên (SP-4 sở hữu).
- **Schema/migration** `0003` additive thuần; `chat_message` không đổi role; FK cascade; nullable `messageId` cho ca câu trả lời rỗng.
- **Rule 9/13:** test verify hành vi thật; `result`/`args` code-derived; summary lossy nhưng giữ nguyên văn lượt gần.

## Verify (độc lập)
```
cd <worktree>
npx vitest run      # kỳ vọng 435 pass (415 baseline + 20 mới)
npx tsc --noEmit    # sạch
npm run build       # xanh
```

## Minh bạch — review nội bộ đã chạy (KHÔNG thay review của bạn)
Mỗi task có 1 reviewer subagent độc lập (sonnet); Task 6 (route) thêm 2-stage (spec+quality) + 1 fix. **Final review (opus) = READY TO MERGE**: contracts frozen verified; baseLen ordering + disjoint-column writes verified an toàn. ⇒ Mong bạn review như con mắt độc lập thật sự (các reviewer trên do tôi điều phối).

## Known minors / follow-up (đã ghi nhận, KHÔNG chặn — bạn xác nhận có đồng ý?)
1. `_load.ts` là bản sao thứ 3 của select+map `/api/stats` — **cố ý** (A2: không repoint /api/stats để giữ test xanh). Backlog: `backlog/agent-harness-sp3-stats-repoint.md`.
2. `ok` heuristic: handler trả object có key `error` hợp lệ → bị đánh `ok:false` (khớp convention repo).
3. Proactive persist-guard so **số lượng key** (đã chứng minh sound).

## ⚠️ Vận hành (không phải lỗi code)
`drizzle-kit generate` CHẠY ĐƯỢC trong sandbox (file-only) → `0003` đã commit. Nhưng **`npm run db:migrate` phải chạy trên host** (live DB) trước khi bản này chạy thật. Code fail-soft nếu chưa migrate (bảng/cột chưa có), nhưng tính năng chỉ hoạt động sau migrate.

## Cần bạn
Review độc lập → **verdict: Ready to merge? (Yes / No / With fixes)** + bất kỳ Critical/Important nào. Tôi chưa merge, đang chờ verdict này + quyết định merge/PR của user.

---
### Phản hồi của lead/code-reviewer (2026-06-05) — ✅ READY TO MERGE: YES

Review độc lập = 1 code-reviewer riêng (opus) đọc thẳng diff `12a97d7..2215f14` (file:line) + chạy suite; cộng tôi tự **spot-check 2 trụ cột** (không tin mù subagent, Rule 13).

**VERDICT: Ready to merge — YES.** Không Critical, không Important.

**Tôi tự verify (cornerstones):**
- **Contract-neutral:** `git diff … -- types.ts registry.ts orchestrator.ts context.ts` = **RỖNG** → SP-1 hợp đồng không đổi. (SP-2/SP-4 trích `ToolEvent`/`makeDispatch`/`convo` an toàn.)
- **Migration 0003 additive:** 6 statement CREATE TABLE/ADD COLUMN/ADD CONSTRAINT; chỗ duy nhất nhắc `chat_message` là **FK reference** (`chat_tool_call.messageId → chat_message.id`, ON DELETE cascade), KHÔNG sửa cột `chat_message`. Không DROP/TYPE.

**Reviewer xác nhận (file:line) các mục "Cần check":**
- **A1 ordering** đúng: `baseLen` (route.ts:213) chụp **SAU** summary splice (:185-190) + proactive replace (:182), **TRƯỚC** `runToolRounds` (:216); `extractToolTurns(convo, baseLen)` đọc convo trả về (không ToolEvent); persist trong `finally` có try/catch riêng → fail-soft.
- **Disjoint-column writes:** 3 update `chat_conversation` ghi cột rời nhau (summary/summarizedThroughId · proactiveState · updatedAt) → không đè.
- **Fail-soft** cả 4 nhánh (summarize/proactive/tool-loop/persist). Token-frame `{i,o}` U+001E giữ nguyên (SP-4 sở hữu).
- **Tests:** 435 pass (89 file), tsc sạch, build xanh. Pure cores test thật (Rule 9/13).
- **A2/A3/A4:** `_load.ts` dùng chung (query-stats import, xoá inline copy) · compose-around `buildSystemPrompt` (chữ ký nguyên) + threshold + dedupe 6h + prune 24h · token-undercount defer đúng.

**3 known-minor — ĐỒNG Ý không chặn:** (1) `_load.ts` bản sao thứ 3 cố ý (giữ test /api/stats xanh) — backlog `agent-harness-sp3-stats-repoint` OK; (2) `ok` heuristic (key `error` → ok:false) khớp convention repo; (3) persist-guard so số key — sound.
**+1 minor reviewer thấy (KHÔNG chặn):** `db.update({updatedAt})` trong stream `finally` (route.ts:316-319) không bọc try/catch → lỗi DB có thể skip `controller.close()`. **Pre-existing từ base `12a97d7`, KHÔNG do SP-3** (xác nhận `git show`). Đề nghị backlog riêng, không gộp vào SP-3.

→ **Merge OK.** Quyết định merge/PR là của **user**. ⚠️ Nhắc vận hành: phải `npm run db:migrate` trên host (live DB) trước khi tính năng chạy thật; code fail-soft nếu chưa migrate. Thread resolve sau khi user quyết merge.
— lead

---
### Review độc lập #2 (lead — phiên review TUẦN TỰ SP-2→SP-3) — CONCUR YES + 2 finding cross-SP bổ sung
**Ngày:** 2026-06-05 · Tôi review SP-3 độc lập (đọc thẳng `persist`/`summarize`/`proactive`/`_load`/`route.ts`/migration `0003` + diff `schema.ts`/`query-stats.ts`; tự chạy `tsc` = exit 0, `vitest` = **435 pass / 89 file / 0 skip**). **ĐỒNG THUẬN verdict YES ở trên.** Tôi tái xác nhận A1 (`baseLen route:213` sau summary splice `:186`/proactive `:182`, trước `runToolRounds :216`), disjoint-column (3 update cột rời), **persist-guard count = SOUND** (truy ca add+prune cùng lượt: add ⇒ surface ⇒ `notice` non-empty ⇒ persist qua toán hạng trái; count chỉ phân xử nhánh `notice===""` nơi mutation duy nhất là prune → count GIẢM hẳn), migration additive (`chat_message` không đổi role), FK-safe `messageId: full?…:null`. Catch `updatedAt` finally pre-existing — đồng ý, backlog riêng (KHÔNG do SP-3).

**Vì tôi review CẢ SP-2 + SP-3 phiên này → 2 điểm verdict #1 (soi SP-3 đơn lẻ) chưa nêu:**

- 🟠 **Đính chính "fail-soft nếu chưa migrate" — chỉ ĐÚNG MỘT PHẦN (Rule 12).** Đã verify `route:92-112` KHÔNG có try/catch và `db.select().from(chatConversations)` (`:93`, select-ALL) sinh `SELECT …, summary, proactiveState`. ⇒ DB chưa migrate: conversation **MỚI** OK + summarize/proactive/persist fail-soft (try/catch); nhưng conversation **CŨ** → Postgres throw `:93` → **POST 500** (không graceful). ⇒ **`npm run db:migrate` (0003) là HARD GATE: chạy TRƯỚC/CÙNG deploy code**, nếu không chat cũ 500. Không phải defect (code đúng với migration của nó) — chỉ cần sửa mô tả + deploy-order bắt buộc.

- 🔴 **Va chạm `route.ts` SP-2 ↔ SP-3 (rủi ro MERGE lớn nhất — chỉ thấy khi soi cả 2 nhánh).** Cả hai viết lại vùng chồng nhau của `/api/chat/route.ts` từ cùng base `12a97d7` ⇒ merge cả hai = 3-way THỦ CÔNG: `dispatch` (SP-2 `withSafety(makeDispatch)` vs SP-3 `makeDispatch`) → gộp `withSafety(makeDispatch(…,ctxSP-3))`; stream/finally (SP-2 tách `streamOllama`/`streamText` vs SP-3 inline+persist) → gộp `streamOllama`+persist+token-frame; `runToolRounds` catch (SP-2 `PendingWriteSignal`→suspend vs SP-3 →`extractToolTurns`) → làm CẢ HAI. **Gap sau gộp:** `handleConfirm` (SP-2) chưa persist tool-turn ⇒ write đã-confirm chưa vào `chat_tool_call` (follow-up `lead-to-sp3-persistence-and-audit#1`). → đã mở backlog `agent-harness-route-merge-reconciliation`. **Merge 1 nhánh trước → rebase nhánh kia → reconcile `route.ts` bởi 1 owner → chạy lại full suite. KHÔNG merge song song mù.**

- 🟠 **(Khuyến nghị, như SP-2)** thêm ≥1 integration test route cho wiring summarize/proactive/persist (mock db/fetch): tool-turn persist đúng `messageId` · summarize-fail→fail-soft · 2 update không đè. Cores test kỹ; tầng GHÉP chưa.

**→ Giữ verdict: Ready to merge = YES (code sound).** Điều kiện vận hành: (1) migration `0003` = hard gate; (2) reconcile `route.ts` với SP-2 (backlog). Để thread **active** tới khi user quyết thứ tự merge (theo verdict #1). Follow-up: integration test + repoint `/api/stats`.
— lead (phiên SP-2→SP-3)
