# Workflow QA — Feature upgrades / chức năng cần thêm (còn lại sau 2026-06-06)

> **Đã xong (06-06):** Xoá workflow (DELETE endpoint + nút xoá + confirm). Xem checkpoint `tech-lead-qa-2026-06-06`.

Ưu tiên còn lại:

- **Quản lý schedule**: hiện CHỈ thêm được — không xoá / không tắt / không sửa, có thể thêm trùng. Cần nút xoá + toggle enable/disable + sửa cron. (`WorkflowDetailClient` bảng schedule read-only.)
- **Editor — xoá node**: không có affordance xoá (chỉ dựa phím Backspace mặc định RF, user không biết). Cần nút xoá node (trên node / trong config panel) + xoá cạnh.
- **Editor — nối node**: Handle đã có (fix F1 06-06). Cần verify kéo-nối + label true/false hoạt động end-to-end live.
- **Editor — cảnh báo thay đổi chưa lưu**: rời trang (back link / đóng tab) mất sạch chỉnh sửa, không hỏi. Cần `beforeunload` guard.
- **Editor — form cấu trúc cho condition/foreach**: hiện buộc gõ **JSON thô** → cần condition = 3 trường (left / dropdown op / right); foreach = builder body trực quan.
- **Editor — picker connector/action**: `connectorId`/`action` đang là text tự do → nên dropdown từ `/api/connectors` + validate.
- **Run — huỷ run đang chạy**: run đồng bộ dài (digest ~24s) chặn, không huỷ được.
- **Connector ghi ngoài thật** (Slack/Drive write) + **manual BLAST_HIGH preview/confirm** (hoãn §10).
