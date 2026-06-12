# Connectors: OAuth đa-provider + 4 connector mới (Slack / WhatsApp / Google Chat / Zalo)

**2026-06-12** · branch `feat/connectors-oauth-multiprovider` · kế thừa spec `2026-06-06-connectors-oauth-google-design.md`
· ground-truth: `.claude/tmp/connectors-research-2026-06-12.json` (7 web-research agents, official docs, 06-12)

## 1. Vấn đề (verify live 06-12, read-only)

1. **Jira hỏng một phần:** Atlassian gỡ `GET /rest/api/3/search` (410 Gone, CHANGE-2046, shutdown
   hoàn tất 10/2025) → `jira_search_issues` + `jira_my_issues` chết. Endpoint mới
   `/rest/api/3/search/jql` đòi JQL **bounded** (≥1 mệnh đề field-operator-value) → JQL fallback
   hiện tại (`ORDER BY updated DESC`) cũng fail 400. Các endpoint khác không bị ảnh hưởng.
2. **Trello chết hẳn:** 401 "invalid key". Nguyên nhân gốc (research): trang `trello.com/app-key`
   đã bị khai tử (~giữa 2023) — key chỉ tồn tại sau khi tạo app trong Power-Up admin portal;
   user cũng hay dán nhầm "Secret" (chỉ dùng cho OAuth1) thay vì API Key → đúng lỗi 401 này.
   Help text hiện tại của connector đang chỉ dẫn theo trang đã chết.
3. **UX auth:** muốn flow authorize 1-click như Google thay vì dán key.
4. **Mở rộng:** Slack, WhatsApp, Google Chat, Zalo.

## 2. Kiến trúc — tổng quát hoá lớp OAuth provider

Hiện trạng: OAuth hard-wired Google (`google-oauth.ts`, `ensureFreshGoogleCreds`,
`saveGoogleTokens`, callback cứng `/api/connectors/google/callback`, nút "Kết nối với Google").

**`src/lib/connectors/oauth/`** — provider registry:

```
oauth/
  types.ts      — OAuthProvider + OAuthTokens + OAuthError(invalidGrant) (thay GoogleAuthError)
  registry.ts   — PROVIDERS: Record<string, OAuthProvider> (google, atlassian, slack, zalo)
  google.ts     — port nguyên google-oauth.ts (giữ 7-day reconnect semantics)
  atlassian.ts  — JSON token endpoint; KHÔNG PKCE; rotating single-use refresh (90d inactivity)
  slack.ts      — form token endpoint (Basic auth); HTTP-200 {ok:false}; KHÔNG refresh (rotation off)
  zalo.ts       — secret qua header `secret_key`; PKCE chỉ có code_challenge (S256 implied);
                  refresh single-use TTL 3 tháng; access ~25h (tin expires_in trả về)
```

```ts
type OAuthTokens = { access_token: string; refresh_token?: string; expires_in?: number;
                     scope?: string; raw?: Record<string, unknown> };
type OAuthProvider = {
  id: string;
  configured(): boolean;                 // env operator đủ chưa
  authUrl(o: { scopes: string[]; state: string; codeChallenge: string; redirectUri: string }): string;
  exchange(o: { code: string; codeVerifier: string; redirectUri: string }): Promise<OAuthTokens>;
  refresh?(refreshToken: string): Promise<OAuthTokens>;  // absent = token không hết hạn (slack)
  enrich?(tok: OAuthTokens): Promise<Record<string, string>>; // creds bổ sung sau exchange
  pkce: boolean;                         // false → bỏ code_challenge (atlassian)
};
```

- **Redirect URI per provider:** `{OAUTH_PUBLIC_BASE_URL}/api/connectors/{providerId}/callback`
  (google đã đăng ký sẵn; atlassian/slack/zalo đăng ký mới trong console operator).
  Route `[id]/[action]`: `authorize` → tra provider từ `def.auth.provider`; `callback` → `id` URL
  chính là providerId; connectorId thật nằm trong state cookie (mã hoá, TTL 10', PKCE verifier).
- **`enrich` per provider:** google = email từ id_token (như cũ); atlassian = GET
  `accessible-resources` → `cloud_id` + `site_url` (+ GET `/me` → account); slack = team.name +
  bot_user_id từ response exchange; zalo = `oa_id` (query callback) + getoa name (best-effort).
- **Refresh chokepoint** (`index.ts`): `ensureFreshGoogleCreds` → `ensureFreshOAuthCreds(def,…)`.
  - Provider không có `refresh` (slack) hoặc creds manual-mode (không có `refresh_token` lẫn
    `expiry_at`) → passthrough.
  - **Mutex per (userId, connectorId)** (Map<string, Promise> in-process — single host): Atlassian
    + Zalo refresh là single-use rotation; concurrent refresh = brick credential.
  - `OAuthError.invalidGrant` → `_needsReconnect` (tri-state needs_reconnect tái dùng nguyên).
- **Account display:** generalize `google_email` → creds `_account` (list() ưu tiên `_account`,
  fallback `google_email` back-compat — KHÔNG migration).
- **`ConnectorListItem.auth.oauthConfigured`**: UI nút authorize khi true; false → fallback fields
  manual + setup-hint cho operator.
- **Dual-mode auth:** connector `type:"oauth"` được khai `fields` fallback. `connectionStatus`:
  oauth-connected = (`_connected==="true"` && (provider không refresh || có `refresh_token`))
  HOẶC đủ fields manual. `connect()` bỏ chặn POST fields cho oauth connector CÓ khai fields.
  Handler tự nhận mode qua shape creds. → User Jira/Trello hiện tại KHÔNG vỡ.

## 3. Jira (sửa search + OAuth Atlassian 3LO)

**Search fix (áp dụng cho CẢ 2 mode):**
- `GET {base}/rest/api/3/search/jql?jql=…&maxResults=15&fields=summary,status,assignee`
  — **bắt buộc truyền `fields`** (mặc định mới chỉ trả `id`).
- JQL mặc định bounded: `updated >= -30d ORDER BY updated DESC`.
  `assignee = currentUser() ORDER BY updated DESC` là bounded (official example) → giữ nguyên.
- Response không còn `total`/`startAt` → trả `{count: issues.length, issues}` (bỏ approximate-count
  — thêm 1 call cho 1 con số ước lượng, không đáng — Rule 2).
- Nếu user đưa JQL unbounded → 400 có message rõ từ Atlassian, lỗi đó trả thẳng cho model (đủ ngữ
  cảnh để model thêm restriction; KHÔNG tự "vá" JQL của user — Rule 13-adjacent).

**OAuth mode (provider atlassian):**
- Scopes classic (khuyến nghị chính thức): `read:jira-work write:jira-work read:jira-user read:me
  offline_access`.
- authorize: `https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=…&scope=…
  &redirect_uri=…&state=…&response_type=code&prompt=consent` (7 param bắt buộc; KHÔNG PKCE).
- token: `POST https://auth.atlassian.com/oauth/token` — **Content-Type: application/json**.
  access 1h; refresh rotating single-use (90d inactivity, ~10' reuse leeway).
- enrich: `accessible-resources` → site đầu tiên (đa-site: lấy [0], ghi info; đa-site đầy đủ =
  follow-up) → `cloud_id`, `site_url`; `GET https://api.atlassian.com/me` → `_account`.
- Handler: `creds.access_token` → Bearer + base `https://api.atlassian.com/ex/jira/{cloud_id}`;
  ngược lại Basic + `https://{site}` (mode cũ). Browse link: `site_url || https://{site}`.
- Operator: console developer.atlassian.com → OAuth 2.0 integration → scopes + callback +
  **Distribution: Enable sharing** (bắt buộc để người khác ngoài account tạo app authorize được).
- Env: `ATLASSIAN_OAUTH_CLIENT_ID`, `ATLASSIAN_OAUTH_CLIENT_SECRET`.

## 4. Trello — authorize 1-click qua fragment-capture (KHÔNG phải OAuth2)

- Trello chưa có OAuth2 (RFC-89 announced 04/2025, chưa GA; cam kết báo trước ≥6 tháng).
  Chọn **client flow `1/authorize` + fragment capture**; thiết kế bước lấy-token swappable.
- Flow: `GET /api/connectors/trello/authorize` → set state cookie (tái dùng `laam_oauth`) →
  redirect `https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token
  &key={env}&return_url={base}/connectors/trello/callback&callback_method=fragment`.
  → Trello redirect về **trang client** `/connectors/trello/callback` (PAGE, không phải API route)
  với `#token=…` (fragment KHÔNG tới server) → JS đọc `location.hash`, `history.replaceState` xoá
  hash ngay, POST `/api/connectors/trello/capture` (session-bound + requireMutator + state cookie
  còn hạn) → server **verify token bằng GET /1/members/me** (key env + token) trước khi lưu creds
  `{key: env.TRELLO_API_KEY, token}` → handlers giữ nguyên signature. → redirect `/connectors`.
- CSRF/injection: Trello không có state param → tự vệ 3 lớp: (1) capture POST đòi session đăng
  nhập + RBAC mutator; (2) cookie `laam_oauth` (connectorId=trello, exp 10') phải tồn tại —
  chứng minh flow khởi phát từ LAAM; (3) verify live token trước khi persist.
- trello.ts: chuyển auth sang header `Authorization: OAuth oauth_consumer_key="…", oauth_token="…"`
  (giữ token khỏi log/proxy — query params vẫn supported nhưng header được khuyến nghị).
- Help text mới (3 ngôn ngữ): key tạo tại `trello.com/power-ups/admin` (app → API Key tab);
  CẢNH BÁO không dán "Secret"; operator phải thêm origin LAAM vào **Allowed Origins** (bắt buộc
  cho return_url; match origin-level).
- Env: `TRELLO_API_KEY` (key coi như public; secret thật = token per-user).

## 5. Slack — OAuth v2 (provider slack)

- Bot scopes: `channels:read,groups:read,channels:history,groups:history,chat:write,chat:write.public`.
- authorize: `https://slack.com/oauth/v2/authorize` (scope=comma-separated). KHÔNG bật PKCE
  (one-way → public client + refresh 30d) và KHÔNG bật token rotation (one-way → 12h tokens).
- exchange: `POST https://slack.com/api/oauth.v2.access` form-encoded, client creds qua HTTP Basic.
  Lỗi = HTTP 200 `{ok:false,error}` → OAuthError. xoxb không hết hạn → không refresh; revoke
  (`token_revoked`/`invalid_auth` từ auth.test) → needs_reconnect.
- enrich: `_account` = team.name (+ bot_user_id lưu creds).
- ⚠ Bot token là per-WORKSPACE: mọi user LAAM authorize cùng workspace nhận cùng bot identity
  (mỗi lần authorize = re-install app). Ghi rõ trong help. Đủ tốt cho team <50; per-user
  attribution (user_scope/xoxp) = follow-up nếu cần.
- Tools: `slack_list_channels` (r; conversations.list types=public+private, cursor pagination),
  `slack_channel_history` (r; conversations.history — bot phải là member, lỗi `not_in_channel`
  trả nguyên cho model kèm hướng dẫn /invite), `slack_send_message` (w, recipientField "channel",
  KHÔNG workflowSafe; chat.postMessage). test = auth.test.
- Env: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`.

## 6. WhatsApp — Cloud API, token-paste (TỰ PHẢN BIỆN: OAuth không khả thi — verdict research)

- Cá nhân: KHÔNG có API chính thức; lib unofficial = ToS violation + Meta ban số → không ship.
- Embedded Signup (OAuth-ish duy nhất) = FB.login JS popup + config_id + Tech Provider/business
  verification + App Review — KHÔNG slot vào pattern redirect của ta và quá nặng cho <50 user.
  → `type:"token"`: fields `access_token` (System User permanent, secret), `phone_number_id`.
- Tools: `whatsapp_send_message` (w, recipientField "to", KHÔNG workflowSafe) — POST Graph
  `v25.0/{phone_number_id}/messages` body `{messaging_product:"whatsapp",to,type:"text",
  text:{body}}`; description ghi rõ 24h-window (ngoài window lỗi 131047 → cần template, đây là
  giới hạn nền tảng). test = `GET /{phone_number_id}?fields=display_phone_number,verified_name`.
- Send-only (inbound = webhook public HTTPS — vô phương trên Tailscale-only) — ghi rõ blurb.
- Template-send + template-list = follow-up backlog (billed per-message từ 7/2025).
- Pin version Graph trong 1 const (`v25.0`), không rải rác.

## 7. Google Chat — provider google, scopes chat (TỰ PHẢN BIỆN: Workspace-only cứng)

- Chat API là Workspace-only CẢ HAI phía: project config (lỗi chính thức "Google Chat API is only
  available to Google Workspace users" với account ngoài Workspace org) VÀ user gọi API.
  Webhook incoming cũng Workspace-only → KHÔNG có fallback cá nhân.
- Quyết định: **VẪN SHIP** connector (cost thấp — tái dùng provider google nguyên vẹn, zero hạ tầng
  mới) với blurb/help/setup ghi rõ điều kiện Workspace; test() sẽ trả lỗi rõ ràng khi không đủ điều
  kiện. Lý do: team dùng email domain riêng (exnodes.vn) — nếu domain chạy Google Workspace thì
  dùng được ngay; nếu không, connector hiển thị điều kiện rõ ràng, không gây hiểu lầm.
- Scopes: `chat.spaces.readonly`, `chat.messages.readonly` (RESTRICTED nếu publish — Testing mode
  OK), `chat.messages.create` (sensitive). Operator: enable Chat API + bắt buộc điền Configuration
  (App name/avatar/description) dù chỉ read.
- Tools: `gchat_list_spaces` (r; GET /v1/spaces + filter spaceType), `gchat_list_messages`
  (r; GET /v1/{space}/messages orderBy createTime DESC), `gchat_send_message` (w, recipientField
  "space", KHÔNG workflowSafe; text-only với user-auth, ≤32KB). test = spaces.list pageSize=1.

## 8. Zalo — OAuth v4 OA (provider zalo; confidence research: MEDIUM → verify runtime)

- Cá nhân không có API → OA API. Consent = **OA admin** cấp cho cả OA (1 token đại diện OA,
  không per-end-user như Google) — ghi rõ help: người bấm Connect phải là admin OA.
- authorize: `https://oauth.zaloapp.com/v4/oa/permission?app_id=&redirect_uri=&code_challenge=
  &state=` (PKCE chỉ có code_challenge, S256 implied, verifier gửi lúc exchange).
- exchange/refresh: `POST https://oauth.zaloapp.com/v4/oa/access_token` — secret qua **header
  `secret_key`**, body form-encoded. access ~25h (TIN `expires_in` trả về, không hardcode);
  refresh 3 tháng, single-use rotation → mutex như Atlassian.
- API: base `https://openapi.zalo.me`, auth qua header **`access_token: <token>`** (không Bearer);
  lỗi = HTTP 200 `{error: <non-zero>, message}` → check field `error` mọi response.
- Tools: `zalo_recent_chats` (r; GET /v2.0/oa/listrecentchat?data={"offset":0,"count":10} —
  data = JSON URL-encoded), `zalo_send_message` (w, recipientField "user_id", KHÔNG workflowSafe;
  POST /v3.0/oa/message/cs; 48h window, 8 tin free/window — ghi trong description).
  test = GET /v2.0/oa/getoa (chạy được không cần gói trả phí).
- Vận hành (help/setup): OA phải **verified** (giấy tờ DN); API messaging cần gói trả phí
  (Growth ~2.5tr/năm = 100 req/min); app phải link OA + activate API + callback URL đăng ký +
  app Live mode. Env: `ZALO_APP_ID`, `ZALO_APP_SECRET`.

## 9. An toàn / policy (không đổi khung)

- Tool mới tự khai `kind` — policy.ts derive tự động, fail-closed như cũ. Registry chỉ thêm import.
- MỌI write mới KHÔNG `workflowSafe` (fail-closed trong workflow) + có `recipientField`.
- **Recipient-gate email-only** (`parseRecipients`): recipientField không-phải-email (channel/
  phone/user_id/space) sẽ LUÔN throw nếu vào gate workflow → fail-closed kép (đã không
  workflowSafe). Khai vẫn đúng (metadata exfil-arg); nếu flip workflowSafe tương lai → mở rộng
  gate format-aware per-tool. → backlog.
- Token vẫn AES-256-GCM per-user blob — **0 migration**.
- Gate `harness-write-tool-subsetting`: +4 connector ≈ +11 tool (3+1+3+2+2) nặng thêm crater
  write-selection ≥16 tool → tool surface tối thiểu; fix hệ thống = quick-tools picker (06-12).
- Trello fragment: token lộ trong URL fragment ở browser (history) — mitigations: replaceState
  xoá hash NGAY, capture page không log, token verify + lưu server-side rồi đổi trang.
  Chấp nhận: rủi ro tương đương user tự copy-paste token (hiện trạng), trong khi UX tốt hơn hẳn.

## 10. UI (ConnectorsClient)

- `auth.oauthConfigured`: true → nút authorize label per-provider `conn.connectWith` ("Kết nối với
  {Tên}"); false → fields manual (nếu có) + setup-hint operator. OAuth connector có fields:
  expander "hoặc nhập token thủ công".
- i18n vi/en/zh: `conn.connectWith`, svc keys cho slack/whatsapp/google-chat/zalo
  (blurb/help/setup), cập nhật help trello (Power-Up admin + Allowed Origins), setup jira.

## 11. Test plan

- oauth/: per-provider unit (authUrl params, exchange content-type/headers — atlassian JSON,
  slack Basic+form+ok:false, zalo secret_key header+form, google form), refresh rotation persist,
  invalidGrant mapping. Mutex: concurrent refresh 1 lần gọi network.
- index.ts: ensureFreshOAuthCreds matrix (fresh/expired/refresh-ok/invalid_grant/no-refresh-provider/
  manual-mode passthrough/mutex). connectionStatus dual-mode. saveOAuthTokens enrich merge.
- jira: search/jql endpoint + fields param + bounded default + count shape; Bearer vs Basic theo
  creds shape; ADF giữ nguyên.
- trello: header OAuth auth; capture verify-before-persist; authorize redirect params.
- slack/whatsapp/gchat/zalo: handler shapes, error conventions (ok:false / error-field / 131047),
  test() calls. Tên test tiếng Việt, vi.stubGlobal("fetch") — pattern google-oauth.test.ts.
- Route: authorize per-provider; callback per-provider; viewer chặn (GET + POST capture); state
  cookie TTL/mismatch.
- Rule 13: mock LLM trả string biến dạng cho recipientField — không tin reproduction (đã có khung
  SP-2; thêm case cho channel/user_id ở confirm-card path nếu chạm).

## 12. Tự phản biện — VERDICT CHỐT (3 adversarial critics 06-12, đều approve-with-changes;
full: `.claude/tmp/connectors-critique-2026-06-12.json`)

**Thay đổi thiết kế theo critique (binding cho implementation):**

1. **[BLOCKER compat] connectionStatus dual-mode:** manual-connected đòi `fields.length > 0 &&
   fields.every(present)` (mảng rỗng KHÔNG được vacuously-true — nếu không, mọi Google/Slack/Zalo
   connector hiện "connected" với mọi user). `connect()` KHÔNG set `_connected="true"` khi lưu
   manual fields cho connector oauth (dòng `type !== "token"` hiện tại sẽ bắn nhầm).
2. **[MAJOR security] Refresh mutex → Postgres advisory lock** (`pg_advisory_xact_lock` keyed
   hashtext(userId:connectorId)): dev + prod chung 1 Postgres = 2 process — Map in-process vô
   dụng. Double-checked: sau khi acquire lock re-read creds, còn fresh thì thoát. Persist RT mới
   NGAY khi nhận (trước mọi call API khác).
3. **[MAJOR simplicity] CẮT Google Chat** → backlog `connectors-google-chat.md` với 2 precondition:
   (a) xác nhận exnodes.vn có Workspace tenant; (b) OAuth app phải migrate sang GCP project thuộc
   Workspace (đụng cả 3 Google connector hiện có). Lý do: Workspace-gate chặn cả account CONFIG
   (project hiện là Gmail cá nhân) → nút connect "trông chạy được" nhưng vĩnh viễn lỗi; −3 tool.
4. **[MAJOR simplicity] Trello GIỮ `type:"token"`** — flow 1-click = authorize ACCELERATOR
   (special-case route `id==="trello" && action==="authorize"` + POST `capture`) kết thúc bằng ghi
   creds token-mode `{key, token}` bình thường. Trello KHÔNG vào PROVIDERS, không đụng nhánh oauth
   của connectionStatus/connect/refresh. UI: token-type có `authorizeConfigured` → nút + fields.
   `configured()` = `TRELLO_API_KEY && OAUTH_PUBLIC_BASE_URL` — KHÔNG BAO GIỜ build return_url
   từ request-origin fallback (Tailscale TLS termination phá origin match). Operator đăng ký CẢ
   origin dev (:8443) + prod vào Allowed Origins.
5. **[MAJOR compat] Mixed-blob precedence (jira) — write-time:** (a) `connect()` lưu manual đủ bộ
   → XOÁ keys oauth (access_token/refresh_token/expiry_at/cloud_id/site_url/_needsReconnect/
   _connected/_account); (b) callback OAuth thành công → giữ manual fields, oauth thắng khi đọc
   (có access_token → Bearer); (c) `invalid_grant` khi refresh: nếu manual fields đủ bộ → STRIP
   keys oauth + persist → connector tiếp tục manual-mode (không needs_reconnect); thiếu →
   `_needsReconnect`.
6. **[MAJOR compat] needs_reconnect lúc GỌI (slack/trello):** provider không refresh → flag chỉ
   có thể set tại call-time. Cơ chế: handler/test ném `OAuthError(invalidGrant=true)` khi gặp
   `token_revoked|invalid_auth|account_inactive` (slack) / 401 invalid token (trello);
   `execute()`/`testConnector()` bắt đúng type này → `setCreds(_needsReconnect)`. UI tự có nút
   re-connect.
7. **[MAJOR compat] Zalo per-OA vs per-user:** behavior 2 user cùng connect 1 OA chưa có ground
   truth (nguy cơ grant sau vô hiệu grant trước, lộ sau ~25h) → help text 3 ngôn ngữ: "một admin
   đại diện team connect OA; re-connect có thể làm đứt kết nối của đồng nghiệp"; backlog runtime-
   verify + phương án creds operator-level nếu xác nhận mutual-invalidation.
8. **[minor security] Cookie per-connector:** `laam_oauth_{connectorId}` — callback quét cookies
   prefix, match bằng `state`, chỉ consume/delete entry của mình → 2 flow song song không clobber.
   Callback assert thêm `BY_ID[cookie.connectorId].auth.provider === urlProviderId` (fail-closed
   chính ta, không nhờ token endpoint của provider fail hộ).
9. **[minor security] Vệ sinh error:** provider module chỉ throw error code/description đã parse —
   không bao giờ kèm request init/secret/header; test assert message không chứa secret. Lỗi
   exchange/refresh KHÔNG trả về model (đã route về `/connectors?error=`).
10. **[minor simplicity] Dual-mode CHỈ jira** (back-compat thật). Slack/Zalo oauth-only không
    fields (token Zalo ~25h dán tay = chết-sau-một-ngày, harmful). WhatsApp vẫn token thuần.
11. **[minor simplicity] Zalo enrich:** lấy `_account`/oa_id từ chính response `getoa` trong
    `enrich(tok)` (1 call sẵn có) — KHÔNG plumbing query `oa_id` từ callback (đầu vào attacker-
    influenceable, không ai consume). Không persist oa_id.
12. **[minor simplicity] Creds-key contract hữu hình:** provider export hằng key (vd
    `ATLASSIAN_CREDS = { cloudId: "cloud_id", siteUrl: "site_url" }`), jira.ts import — drift
    thành lỗi compile; thêm round-trip test (enrich output → handler → đúng Bearer base URL).
13. **[minor ops] Atlassian/Zalo chỉ 1 callback URL/app + team chạy 2 base (dev :8443/prod):**
    QUYẾT ĐỊNH: OAuth atlassian/zalo verify trên PROD base; dev dùng jira manual fields, zalo bỏ
    qua ở dev. Ghi vào setup text.
14. **[minor ops] Docs scope:** `.env.example` (block per provider), `DEPLOYMENT.md` (bảng env +
    checklist console per provider, gồm Atlassian "Enable sharing" + Trello Allowed Origins),
    README sync ngắn. Không validate env lúc boot (configured() degrade graceful — Rule 2).
15. **[giữ nguyên sau phản biện] WhatsApp SHIP** (user yêu cầu rõ) với blurb/help nêu thẳng:
    send-only, chỉ trong 24h-window (LAAM mù trạng thái window — lỗi 131047 là bình thường ngoài
    window), operator setup nặng nhất (Meta Business + verification). Báo cáo nêu trade-off để
    user quyết giữ/bỏ — code 1 tool, gỡ dễ. **Trello `expiration=never` GIỮ** (token revocable,
    30days = reconnect tay hàng tháng không có automation; risk window fragment đã mitigate bằng
    replaceState + Referrer-Policy: no-referrer + no third-party script trên capture page; rủi ro
    tương đương copy-paste token thủ công hiện tại — ghi nhận pre-scrub history window +
    extension exposure là accepted risk).
16. **Số liệu đúng:** +6 tools (slack 3, whatsapp 1, zalo 2), writes 11 → **14** (sát ngưỡng
    crater 16 — gate subsetting vẫn đứng; gchat cắt giúp không chạm 15).
