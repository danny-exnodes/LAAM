import crypto from "node:crypto";

// Auth cho POST /api/workflows/tick — KHÔNG session (máy gọi: Windows Task poke).
//
// Hai chế độ LOẠI TRỪ NHAU theo WORKFLOW_TICK_SECRET:
//  (A) Secret ĐƯỢC SET (non-empty, prod): CHỈ cho qua khi header
//      x-workflow-tick-secret KHỚP secret (so sánh hằng-thời-gian timingSafeEqual;
//      độ dài lệch → reject). KHÔNG fallback localhost-trust — Host: localhost
//      giả-được nếu port 3100 truy cập trực tiếp.
//  (B) Secret KHÔNG set (dev): cho qua localhost (Host = localhost/127.0.0.1/::1)
//      VÀ KHÔNG có header forwarding (proxy có thể giả Host → nếu thấy x-forwarded-*
//      thì không tin localhost).
export type TickEnv = { WORKFLOW_TICK_SECRET?: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

// So khớp secret hằng-thời-gian. Độ dài lệch → false (timingSafeEqual ném nếu
// buffer khác độ dài). header null → false.
function secretMatches(provided: string | null, expected: string): boolean {
  if (provided == null) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function hostIsLocal(hostHeader: string | null): boolean {
  if (!hostHeader) return false;
  // Bỏ port: "localhost:3100" → "localhost"; "[::1]:3100" → "::1".
  let h = hostHeader.trim().toLowerCase();
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    h = end >= 0 ? h.slice(1, end) : h.slice(1);
  } else {
    const colon = h.indexOf(":");
    if (colon >= 0) h = h.slice(0, colon);
  }
  return LOCAL_HOSTS.has(h);
}

export function isTickAuthorized(headers: Headers, env: TickEnv): boolean {
  const secret = env.WORKFLOW_TICK_SECRET;

  // (A) Secret SET (non-empty) → CHỈ secret. KHÔNG fallback localhost (chống giả Host).
  if (secret) {
    return secretMatches(headers.get("x-workflow-tick-secret"), secret);
  }

  // (B) Secret UNSET (dev) → localhost, chỉ khi KHÔNG qua proxy (không có forwarding
  // header) → tránh Host giả mạo. forwarded-for/host/proto bất kỳ → không tin local.
  const proxied =
    headers.has("x-forwarded-for") || headers.has("x-forwarded-host") || headers.has("x-forwarded-proto");
  if (!proxied && hostIsLocal(headers.get("host"))) return true;

  return false;
}
