# Per-use attribution cho token admin cấp (fold-deferred từ v2.4.1)

**Bối cảnh:** admin cấp token cho X → MCP route ghi `agent_session.userId = X` mỗi lần gọi (attribution). Một token admin-cấp tạo hoạt động hiện ra **như là của X** trong Monitoring, không phân biệt được với việc X tự làm.

**Đã làm ở v2.4.1 (đủ bar cho team <50):** marker code-set `(provisioned by <admin>)` trong tên khoá + cột `createdByUserId` hiện ở keys-list và `/settings/access` của chính chủ + audit `token_issued_for` lúc cấp.

**Chưa làm (defer — đụng bảng nóng `agent_session`):** stamp mỗi phiên MCP bằng `createdByUserId`/`actorTokenId` để Monitoring hiển thị "thực hiện bởi token do <admin> cấp" ở cấp **từng lần dùng**, không chỉ lúc cấp. Cần migration thêm cột vào `agent_session` (bảng ghi nóng, cân nhắc chi phí). Làm khi có nhu cầu audit per-use thật hoặc khi MCP write GA.
