# Backlog: connector crypto — global key → per-user HKDF (+ SSRF DNS-pin)

**Nguồn: panel security 06-11 (plan v2.3) — 2 lỗ hổng xuyên suốt không proposal nào xử lý đủ.**

## 1. Global encryption key (ưu tiên khi thêm credential bậc tiền-mặt)
- `src/lib/connectors/crypto.ts:9-13`: MỘT key (CONNECTOR_KEY ?? AUTH_SECRET ?? dev-fallback,
  sha256) mã hoá TOÀN BỘ credential mọi user. Lộ 1 env → giải mã ~50 credential cùng lúc
  (GitHub/Google token, sắp tới có thể cả Anthropic API key per-user BYOK).
- Đề xuất: per-user key derivation **HKDF(masterKey, userId)** — additive, re-encrypt dần khi
  user chạm credential (lazy migration); hoặc KMS/DPAPI nếu muốn mạnh hơn. Cần spec nhỏ riêng.
- Điều kiện kích hoạt: TRƯỚC khi ship per-user Anthropic API key (BYOK) hoặc khi user-base
  mở ra ngoài nhóm tin cậy.

## 2. SSRF DNS-rebind trên MCP client (nâng severity: thấp → TRUNG)
- `src/lib/connectors/mcp/ssrf.ts:4-5`: chỉ check hostname/IP literal lúc config, KHÔNG resolve
  DNS → hostname public trỏ 169.254.169.254/IP nội bộ vẫn lọt (member không tin cậy có thể
  pivot metadata/nội bộ qua server-side fetch).
- Fix: DNS-pin / resolve-check bằng custom undici dispatcher — ước lượng thật 1-2 ngày
  (KHÔNG phải "1 buổi" như ghi chú cũ trong code).
