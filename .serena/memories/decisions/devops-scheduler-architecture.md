# Quyết định (ĐỀ XUẤT — chờ DevOps team chốt): Kiến trúc Scheduled Jobs / host-coupling

**2026-06-15.** Phát sinh từ: fix terminal-nháy → S4U cho Windows Scheduled Task (xem checkpoint `claude-2026-06-12.md`), user hỏi có xung đột với hướng **DevOps gom-hết-vào-Docker** + khả năng **lên cloud** tương lai không. Tranh biện 4 vị trí (advocate↔critic) → tổng hợp. Liên quan [[workflow-orchestration-architecture]] (scheduler = "DB-claim atomic + Windows Task poke").

## Bối cảnh (3 job đang là Windows Scheduled Task)
1. **workflow-tick** — mỗi phút POST `/api/workflows/tick` + secret. **Logic lập lịch nằm TRONG app** (DB-claim-atomic: chọn run tới hạn → claim nguyên tử → chạy). Windows task chỉ là **nhịp tim "poke" ngu** vào endpoint idempotent. Vừa đổi Interactive→S4U.
2. **db-backup** — 02:00/ngày, `docker exec laam-v2-postgres pg_dump` ra thư mục host, retention 14.
3. **host-metrics** — node sampler chạy nền host (:47600) đọc **phần cứng vật lý** (GPU/CPU/RAM).

Outliers khác (ngoài phạm vi quyết định này, host-bound có chủ đích): **Ollama native GPU**, **Tailscale**.

## Chốt then chốt
tick là **nhịp tim ngu** gọi endpoint **idempotent** (DB-claim-atomic chống double-fire kể cả N replica). ⇒ lý do kinh điển giữ cron tách-ngoài đã bị trung hoà → lựa chọn tick chủ yếu là **văn hoá đội**, không phải đúng/sai kỹ thuật. Coupling host hiện tại **nông**: chỉ cái *trigger*, không phải *bộ não*.

## 4 vị trí (tóm tắt)
- **A. Windows Task (S4U, status quo):** ít công nhất cho 1 máy; nhưng host-specific, không đi cloud, log xé đôi, secret trong task → là nợ phải làm lại. = thứ Docker-everything muốn xoá.
- **B. Docker sidecar cron** (supercronic/ofelia curl tick + `postgres-backup-local`): tất cả vào `docker compose up` + git + `docker logs`; map ~1:1 sang k8s CronJob. Tốn 1–2 container + backup-dump cần đích (named volume + offsite, đừng host-mount lại).
- **C. In-app scheduler** (node-cron trong container app): nhẹ nhất, portable tuyệt đối (chỉ là code app), DB-claim chống double-fire; NHƯNG ghép tiến trình web + khó pause/observe riêng + **không giải quyết được backup** (pg_dump không có trong image Next.js).
- **D. Managed/k8s CronJob:** đích cloud-native đúng sách; overkill bây giờ (chưa có k8s) → là đích, không phải lựa chọn "now".

## QUYẾT ĐỊNH (phased)
| Job | NOW (Windows) | Docker-everything | Cloud |
|---|---|---|---|
| **tick** | giữ S4U task (chạy tốt, 0 downside) | **→ sidecar cron (B)** curl `http://app:3000/api/workflows/tick` | → **k8s CronJob** (map 1:1 từ sidecar) |
| **backup** | giữ S4U task | **→ sidecar `postgres-backup-local`** (named volume + copy OFFSITE) | → **managed DB snapshot** |
| **host-metrics** | giữ (→ NSSM service nếu cần sống-qua-logoff) | **giữ host** (đọc phần cứng — đừng dockerize, host-mount leaky) | cloud monitoring / N/A |

**Chọn B (sidecar) cho tick, KHÔNG C (in-app):** user nói team "tập trung hết vào Docker" = văn hoá *infra-as-containers* → muốn cron **nhìn thấy được** (log riêng, pause không cần redeploy app, ops sở hữu). **C in-app là phương án nhẹ hơn** — chọn nếu team thiên *dev-centric*. Cả hai đều thắng A về chiến lược. **D = đích cloud**, không làm bây giờ.

**S4U KHÔNG phí:** giữ prod khoẻ trong giai đoạn chuyển; retire Windows task chỉ khi sidecar đã lên + verify.

## Rủi ro residual
- Backup→named volume = portable nhưng **phải copy offsite** mới là DR thật — đừng mất tính bền "dump ra host folder" mà không có cái thay.
- Sidecar chỉ giúp khi **Docker chạy lúc logoff** (cùng caveat S4U) → cần Docker engine service-mode/WSL, không phải Docker Desktop chỉ-khi-đăng-nhập.
- Cron lên cloud là phần **DỄ**; việc khó thật khi cloud = **kinh tế GPU Ollama** (trả tiền GPU vs đổi API model) + host-metrics mất nghĩa. Đừng để cron che mất.

## Trạng thái
**ĐỀ XUẤT — chưa implement, chưa lock.** Chờ DevOps team chốt B-vs-C cho tick + xác nhận lộ trình. Khi chốt B: build trong worktree riêng (sidecar supercronic + postgres-backup vào `docker-compose.yml`, script retire 2 Windows task, verify dev). Nguồn tranh biện đầy đủ: phiên chat 2026-06-15 (workflow panel stalled do session-limit → tổng hợp inline).
