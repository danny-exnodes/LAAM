# Connectors — OAuth đa-provider + Slack/WhatsApp/Zalo (2026-06-12)

**✅ MERGED vào main 06-12 tối** (merge `14253e5`, feature commit `700bf9c`; worktree + branch đã dọn;
**1966/1966 test + tsc sạch trên main sau merge** — chung sống với quicktools `ac76146`;
conflict duy nhất CHANGELOG đã resolve giữ cả 2 section; section Node-24 uncommitted được bảo toàn) · spec
`docs/superpowers/specs/2026-06-12-connectors-oauth-multiprovider.md` (trên branch) ·
ground-truth research + critique: `.claude/tmp/connectors-{research,critique}-2026-06-12.json`.
Quy trình: verify live → 7 web-research agents → spec → 3 adversarial critics (1 blocker + 6 major
→ sửa hết) → core (main session) + 5 connector agents song song → review 3-lens + verify.

## Phát hiện verify live (06-12, read-only)
- **Jira search CHẾT từ ~10/2025:** Atlassian gỡ `GET /rest/api/3/search` (410, CHANGE-2046).
  Endpoint mới `/search/jql`: đòi JQL **bounded**, `fields` mặc định CHỈ trả id (phải truyền),
  không còn `total`/`startAt` (cursor `nextPageToken`). FIX: default JQL `updated >= -30d ORDER BY
  updated DESC`, trả `{count, issues}`. **Verify live 200/15 issues.**
- **Trello creds đang lưu chết (401 invalid key):** trang `trello.com/app-key` đã khai tử ~2023 —
  key chỉ tạo qua Power-Up admin; dán nhầm ô "Secret" = 401 kinh điển. Help text đã viết lại.

## Quyết định kiến trúc (binding — spec §12)
- **`oauth/` provider registry** (google/atlassian/slack/zalo) sau interface chung; quirks:
  atlassian = JSON token endpoint + KHÔNG PKCE + refresh xoay-vòng-dùng-1-lần (90d);
  slack = HTTP-200 `{ok:false}` + bot token KHÔNG hết hạn (không refresh; KHÔNG bật rotation/PKCE
  — công tắc một chiều); zalo = secret qua header `secret_key` + PKCE chỉ `code_challenge` +
  refresh 3 tháng dùng-1-lần (confidence MEDIUM — cần runtime-verify).
- **Refresh sau `pg_advisory_xact_lock`** (oauth/lock.ts) + double-check: dev và prod CHUNG 1
  Postgres → mutex in-process vô dụng; refresh xoay vòng đua nhau = brick credential.
- **Trello KHÔNG vào PROVIDERS** — accelerator riêng (oauth/trello.ts): `1/authorize` →
  token về qua **URL fragment** → trang capture client → POST verify-trước-persist
  (session + RBAC + cookie chứng-minh-flow). Vẫn `type:"token"` — ghi creds `{key, token}` thường.
  `expiration=never` giữ (đã cân với 30d — risk tương đương copy-paste tay).
- **Dual-mode CHỈ jira:** fields manual giữ nguyên (user Basic cũ không vỡ). Mode-switch write-time:
  manual đủ bộ → strip keys OAuth; `invalid_grant` + manual đủ → tự rơi về manual (không kẹt
  needs_reconnect). **Bẫy đã né (blocker critic):** manual-connected phải đòi `fields.length > 0`
  — `[].every()` vacuously-true sẽ làm MỌI connector OAuth không-fields hiện "connected".
- **needs_reconnect lúc GỌI:** handler slack/trello ném `OAuthError(invalidGrant)` khi token bị thu
  hồi (token_revoked/invalid_auth/401) → execute()/testConnector() bắt → flag. Trước đây flag chỉ
  set được trong refresh-path → connector không-refresh "connected" mãi dù chết.
- **Cookie state per-connector** `laam_oauth_<id>` (2 flow song song không đè nhau); callback
  match theo `state` + assert `provider(connectorId cookie) === provider URL` fail-closed.
- **CẮT Google Chat** (dead-on-arrival): Chat API chặn Workspace CẢ account config lẫn user —
  GCP project hiện là Gmail cá nhân → không enable nổi API; xem backlog preconditions.
- **WhatsApp = token-paste có chủ đích** (Embedded Signup đòi Tech Provider + business verification,
  flow JS popup không khớp redirect pattern); **chỉ gửi** (inbound = webhook public — vô phương
  Tailscale-only), trong cửa sổ 24h (ngoài → lỗi 131047, cần template — chưa hỗ trợ).
- **Zalo consent per-OA bởi ADMIN** (không per-user); 2 admin cùng connect 1 OA = hành vi CHƯA
  verify (nguy cơ vô hiệu chéo) → help text "một admin đại diện" + backlog.
- Tools 36→42, **writes 11→14** (slack/whatsapp/zalo send — đều KHÔNG workflowSafe + có
  recipientField; recipient-gate hiện email-only → các recipient không-email fail-closed kép).
- Env mới: `ATLASSIAN_OAUTH_CLIENT_ID/SECRET`, `SLACK_CLIENT_ID/SECRET`, `TRELLO_API_KEY`,
  `ZALO_APP_ID/SECRET` (+`OAUTH_PUBLIC_BASE_URL` dùng chung). Atlassian/Zalo chỉ 1 callback/app
  → OAuth verify trên PROD base; dev dùng jira manual. Checklist: DEPLOYMENT.md §8b–8e.

## Trạng thái
- **MERGED** (xem đầu file). Live verify jira search fix OK (200/15 issues). UI dual-mode +
  i18n vi/en/zh đủ (+test chống drift dict↔connector).
- Live OAuth các provider mới cần operator setup console + env (DEPLOYMENT §8b–8e);
  Trello: user bấm "Kết nối với Trello" thay creds chết sau khi có env.
- Review 3-lens + adversarial-verify post-merge: 10 finding thật → **fix `c7c36e1`** (1972 test).
  3 bài học load-bearing: (1) advisory-lock-trong-transaction phải LUỒN TX vào mọi query của
  holder — holder cần connection thứ 2 từ pool là topology deadlock; (2) double-check re-read
  null = authoritative (KHÔNG `?? creds` — hồi sinh credential đã disconnect); (3) cookie delete
  của Next phải lặp lại đúng `path` lúc set, delete trần = Path=/ = cookie khác, không xoá gì.
- Follow-ups: [[backlog/connectors-oauth-followups]].
