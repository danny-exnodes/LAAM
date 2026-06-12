# Bàn giao khoá admin-cấp không-lộ-secret + TTL (defer từ v2.4.1)

**Hiện tại (v2.4.1):** admin cấp khoá cho X → **admin thấy plaintext 1 lần** rồi tự bàn giao cho X qua kênh an toàn. Chấp nhận được vì khoá read-only org-shared + audit + revoke ngay. Guardrail: token không vào log, `Cache-Control: no-store`, cảnh báo trung thực.

**Thiết kế tốt hơn (defer — vi phạm "team <50 KHÔNG state machine"):** luồng **pending-key / user-tự-hoàn-tất**:
- admin tạo "lời mời cấp khoá" (chưa có secret) cho X.
- X vào `/settings/access` thấy "admin mời tạo khoá tên Y" → bấm để **materialize** (secret sinh ra + hiện cho CHÍNH X, admin không bao giờ thấy).
- Bảo toàn riêng tư tuyệt đối (admin không cầm secret hoạt-động-như-X).

Cần state nhỏ (token pending). Làm khi: (a) MCP có scope **write** (lúc đó admin cầm secret write-as-X là rủi ro thật), hoặc (b) có nhu cầu compliance không-lộ-secret.

**Kèm theo:** cân nhắc `expiresAt`/TTL mặc định cho khoá admin-cấp (giảm blast-radius nếu bàn giao rò). Hiện cấp không TTL.

**Khi MCP write GA:** re-gate cấp-khoá-write về **owner-only** (token hiện giả định `scopes:["read"]`).
