# Backlog: make the host metrics sampler persistent (P1 durability)

Ngày: 2026-06-04. Liên quan: [[host-metrics-sampler]].

## Vấn đề
`host-agent/laam-host-metrics.mjs` phải **chạy thường trú trên host** để
Hardware Analytics (`/machines`) có dữ liệu. Nếu sampler tắt → `/api/host/metrics`
trả 503 → các thẻ hiển thị "Không lấy được số liệu phần cứng" (degrade mềm, không vỡ).

Hiện tại nó đang chạy qua tiến trình nền của phiên Claude → **sẽ tắt khi phiên kết thúc/reboot**.

## Việc cần làm (giống Ollama/collector durability — cùng nhóm P1)
- Chạy sampler như **Windows Service** (NSSM/pm2) HOẶC Task Scheduler "at startup".
  Ví dụ NSSM: `nssm install laam-host-metrics node "D:\...\host-agent\laam-host-metrics.mjs"`.
- (Tùy chọn) đặt `HOST_METRICS_TOKEN` cùng giá trị ở sampler và ở app env để chặn
  truy cập tùy tiện trong tailnet/LAN (port 47600 bind 0.0.0.0).
- Verify sau reboot: `curl http://127.0.0.1:47600/metrics` trả JSON; `/machines` (đăng nhập) hiện thẻ.

## Tạm thời
Khởi động tay: `node host-agent/laam-host-metrics.mjs` (hoặc nền). Xoá file này khi đã dựng service.
