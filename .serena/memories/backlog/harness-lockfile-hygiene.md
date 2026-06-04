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

## Xoá file này khi đã đọc & nắm.
