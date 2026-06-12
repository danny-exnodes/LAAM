# Heads-up (→ dashboard/agent-harness session): package-lock hygiene

Ngày: 2026-06-04. Người tạo: session networking/Docker.

## Chuyện gì đã xảy ra
Commit `611c4e9` (cost/token charts) **ghi đè `package-lock.json`** (xoá
`@emnapi/runtime` + `@emnapi/core`, −~130 dòng) **mà KHÔNG đổi `dependencies`
trong `package.json`** (diff package.json chỉ có `"dev": "next dev -p 3100"`).

→ `npm ci` (bản build production trong Docker) **fail** với `EUSAGE: lock out of
sync` ("Missing: @emnapi/... from lock file"). Production build bị chặn.

## Đã sửa (networking session)
Khôi phục `package-lock.json` về bản known-good `e40d764` (commit **`64faa06`**) —
deps không đổi nên lock đó hợp lệ; đã verify `npm ci` pass; build + deploy lại OK.

## Đề nghị cho lần sau (để không tái diễn)
- **Đừng commit `package-lock.json` đã bị regenerate/prune** nếu KHÔNG thực sự
  thêm/bớt dependency trong `package.json`. Lock bị đổi mà deps không đổi = artifact
  do `npm install` ở npm version/flag khác (vd `--omit=optional`).
- Khi **có** đổi deps: chạy `npm install` (đầy đủ, không `--omit`), commit lock đã
  sync; production build dùng `npm ci` (strict) nên lock PHẢI khớp 100%.
- Muốn kiểm tra nhanh trước khi commit: `npm ci` ở máy sạch phải chạy không lỗi.

## Tái diễn lần 5 (2026-06-12) — playbook chuẩn
Lock trên main (sau merge batch2/v2.4.0) lại thiếu `@emnapi/core` + `@emnapi/runtime`
top-level (bị drop từ `22ddf44`, npm 11 trên host prune optional musl/WASM deps).
`npm ci` trong alpine (npm 10) fail "Missing: @emnapi/...@1.11.0 from lock file";
host npm 11 lại coi lock là HỢP LỆ → không phát hiện được trên host.

**Playbook đã verify (theo RULE trong commit `efb4013`):**
1. Copy `package.json` + `package-lock.json` ra thư mục scratch (không mount repo).
2. `docker run --rm -v <scratch>:/app -w /app node:22-alpine npm install --package-lock-only`
3. Verify trong alpine: `npm ci --dry-run` pass.
4. Copy lock về repo, verify host: `npm ci --dry-run` pass.
Host `node_modules` không bị đụng. Diff chuẩn ≈ 62+/32− (2 entry @emnapi + churn cờ `peer`).

## ✅ FIX TRIỆT ĐỂ (2026-06-12, cùng phiên): pin vào devDependencies
Pin `@emnapi/core` + `@emnapi/runtime` `^1.11.0` vào **`devDependencies`** trong
`package.json` → dep BẮT BUỘC, không npm version nào prune được khỏi lock.

**⚠️ Phát hiện quan trọng (đã test, đừng lặp lại):** pin vào `optionalDependencies`
KHÔNG đủ — npm 11 vẫn prune (semantics "optional" = được phép vắng mặt). Phải là
mandatory dep (devDependencies).

**Verify 4 chiều (đều pass):** alpine npm10 `npm ci --dry-run` · host npm11
`npm ci --dry-run` · npm11 regen lock trên scratch → 2 entry top-level còn nguyên ·
alpine chấp nhận lock do npm11 sinh. 1757 test xanh sau edit package.json.

RULE "re-sync alpine sau npm install trên host" chỉ còn cần cho package musl/WASM
KHÁC @emnapi trong tương lai (class lỗi chưa diệt — user từ chối đồng bộ npm 11
vào Dockerfile; nếu drift tái diễn với package khác, cân nhắc lại option đó).

## Xoá file này khi đã đọc & nắm.
