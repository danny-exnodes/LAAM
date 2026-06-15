# Backlog: connectors — follow-ups sau đợt OAuth đa-provider (2026-06-12)

Nguồn: spec `2026-06-12-connectors-oauth-multiprovider.md` §12 + critique. Xoá mục khi xong.

## 1. Google Chat — CHỜ 2 precondition (đã CẮT khỏi đợt này, có thiết kế sẵn)
- Chat API là Workspace-only CẢ HAI phía: account CONFIG (lỗi chính thức "Google Chat API is only
  available to Google Workspace users") lẫn user gọi API; webhook incoming cũng Workspace-only.
- Precondition: (a) xác nhận exnodes.vn có Google Workspace tenant (1 câu hỏi cho ops);
  (b) OAuth app phải migrate/tạo lại trong GCP project thuộc Workspace — đụng CẢ 3 Google
  connector hiện có (đổi client = mọi user reconnect).
- Thiết kế sẵn (spec §7 bản trước-critique + research `google-chat-api`): provider google,
  scopes chat.spaces.readonly / chat.messages.readonly (RESTRICTED khi publish) /
  chat.messages.create; bắt buộc điền Configuration tab (App name/avatar/desc) dù chỉ read;
  tools gchat_list_spaces / gchat_list_messages / gchat_send_message (w, space).

## 2. Zalo — runtime-verify (research confidence MEDIUM)
- Verify khi operator có app + OA: secret_key header, expires_in thực tế (25h vs 1h), shape
  `data=` JSON param của listrecentchat, error codes, và **hành vi 2 admin cùng connect 1 OA**
  (grant sau có vô hiệu grant trước?). Nếu mutual-invalidation → chuyển creds zalo sang
  operator-level (shared) thay vì per-user.

## 3. Recipient-gate format-aware — TRƯỚC mọi flip workflowSafe cho slack/whatsapp/zalo
- `parseRecipients` (gate workflow) chỉ chấp `local@domain` → recipientField channel/phone/user_id
  sẽ LUÔN throw trong workflow (hiện vô hại vì cả 3 write đều không workflowSafe — fail-closed kép).
  Muốn cho tool nào chạy workflow phải mở rộng gate per-format (channel-id, E.164, OA user-id)
  + allowlist tương ứng. KHÔNG flip cờ trước khi làm việc này.

## 4. Operator setup để live (user/ops quyết)
- Checklist DEPLOYMENT.md §8b–8e: Atlassian app (Enable sharing!), Slack app, TRELLO_API_KEY +
  Allowed Origins (cả dev :8443 lẫn prod), Zalo app + OA verified + gói API.
  Dev `.env` hiện chưa có cả `OAUTH_PUBLIC_BASE_URL` → mọi nút authorize ở dev đang tắt (đúng
  thiết kế degrade); jira/trello dùng nhập tay ở dev.
- Trello: creds đang lưu trong DB đã CHẾT (401) — sau khi merge + env, user bấm "Kết nối với
  Trello" để thay. Jira manual mode hoạt động lại ngay sau merge (search fix không cần OAuth).

## 5. Nhỏ
- jira_add_comment/create_issue: cân nhắc recipientField ("key"/"projectKey") — hiện không khai
  (destination trong-tài-khoản, giống github/trello write; gate là cho exfil target). Quyết khi
  đụng workflow-safe cho jira.
- Đa-site Atlassian: enrich đang bind site ĐẦU TIÊN từ accessible-resources; user nhiều site cần
  picker — chờ nhu cầu thật.
