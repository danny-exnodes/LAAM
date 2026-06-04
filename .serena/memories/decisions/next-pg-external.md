# Decision: `pg` là serverExternalPackages trong next.config.ts

**Ngày:** 2026-06-04 · Bối cảnh: dev server báo `Module not found: Can't resolve 'pg'` từ `drizzle-orm/node-postgres/session.js`, trace qua `src/db/index.ts` ← `src/app/machines/page.tsx` (server component import `@/db` trực tiếp).

## Vấn đề
`pg` CÓ trong `node_modules` + `package.json` (8.21.0) — không thiếu file. Lỗi do **Next/Turbopack cố bundle `pg`**, mà `pg` có optional require (`pg-native`…) không nhúng được → "Can't resolve". Route API import db vẫn chạy, nhưng **server component import `@/db` trực tiếp** (machines page) + `output:"standalone"` làm lộ ra.

## Quyết định
Thêm vào `next.config.ts`:
```ts
serverExternalPackages: ["pg"],
```
→ Next coi `pg` là external runtime (require lúc chạy, không bundle). Đúng cho **cả `next dev` (Turbopack) lẫn build standalone** (Docker). Next 16.2.7 hỗ trợ key top-level này (`config-shared.d.ts`).

## Hệ quả / lưu ý
- `next.config.ts` thuộc phạm vi **session docker** (output:standalone). Sửa additive, không đụng `output`/`allowedDevOrigins`.
- **next.config KHÔNG hot-reload** → phải **restart `npm run dev`** mới có hiệu lực. Nếu còn lỗi: xoá `.next` rồi chạy lại.
- Nếu sau này thêm driver/native package server-only khác (vd `bcrypt`) gặp lỗi tương tự → thêm vào cùng mảng `serverExternalPackages`.
- KHÔNG do SP-1 ([[agent-harness-architecture]]); là tương tác machines-page + standalone. Liên quan [[agent-ops-rules]] (không tự restart dev — user tự host).
