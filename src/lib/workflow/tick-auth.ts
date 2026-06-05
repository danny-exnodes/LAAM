// Auth cho POST /api/workflows/tick — KHÔNG session (máy gọi: Windows Task poke).
// Cho qua nếu: (1) header x-workflow-tick-secret KHỚP WORKFLOW_TICK_SECRET (đường
// mạnh, ưu tiên), HOẶC (2) request đến từ localhost (Host = localhost/127.0.0.1/::1)
// VÀ KHÔNG có header forwarding (Host giả-được khi qua proxy → nếu thấy x-forwarded-*
// thì không tin localhost). THUẦN để test. Prod nên set WORKFLOW_TICK_SECRET.
export type TickEnv = { WORKFLOW_TICK_SECRET?: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

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
  // (1) Secret: chỉ khớp khi env có secret KHÔNG rỗng và header bằng đúng nó.
  const secret = env.WORKFLOW_TICK_SECRET;
  if (secret && headers.get("x-workflow-tick-secret") === secret) return true;

  // (2) Localhost: chỉ khi KHÔNG qua proxy (không có forwarding header) → tránh
  // Host giả mạo. forwarded-for/host/proto bất kỳ → coi như không phải local trực tiếp.
  const proxied =
    headers.has("x-forwarded-for") || headers.has("x-forwarded-host") || headers.has("x-forwarded-proto");
  if (!proxied && hostIsLocal(headers.get("host"))) return true;

  return false;
}
