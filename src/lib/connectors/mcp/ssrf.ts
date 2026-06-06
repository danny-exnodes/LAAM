// SSRF guard for user-supplied MCP server URLs. A remote MCP server is fetched
// server-side with the user's auth token, so an attacker who can set the URL
// could otherwise pivot to internal services or the cloud metadata endpoint.
// This is a defence-in-depth hostname/literal-IP check at config time — it does
// NOT resolve DNS (a hostname that resolves to a private IP is not caught here).

// Throw if `url` is not http(s) or points at a loopback / private / link-local /
// unspecified host (incl. 169.254.169.254 metadata) or a *.local mDNS name.
export function assertSafeUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("URL không hợp lệ");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`giao thức không cho phép: ${parsed.protocol}`);
  }

  // URL keeps IPv6 hosts in brackets, e.g. "[::1]" — strip them for comparison.
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || host === "0.0.0.0" || host === "::1" || host === "::") {
    throw new Error(`host nội bộ không cho phép: ${host}`);
  }
  // mDNS / local domains (covers "foo.local", "printer.local").
  if (host === "local" || host.endsWith(".local")) {
    throw new Error(`host nội bộ không cho phép: ${host}`);
  }

  // IPv4 literal → range checks on the octets.
  const octets = host.split(".");
  if (octets.length === 4 && octets.every((o) => /^\d{1,3}$/.test(o))) {
    const [a, b] = octets.map((o) => Number(o));
    if (octets.some((o) => Number(o) > 255)) {
      throw new Error(`IP không hợp lệ: ${host}`);
    }
    const isPrivate =
      a === 127 || // 127.0.0.0/8 loopback
      a === 10 || // 10.0.0.0/8
      a === 0 || // 0.0.0.0/8 unspecified
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 192 && b === 168) || // 192.168.0.0/16
      (a === 169 && b === 254); // 169.254.0.0/16 link-local (incl. 169.254.169.254 metadata)
    if (isPrivate) {
      throw new Error(`IP nội bộ không cho phép: ${host}`);
    }
  }

  // Bracketed-IPv6 loopback variants like [::ffff:127.0.0.1] / [::1].
  if (host.includes(":") && (host === "::1" || host.startsWith("::ffff:127."))) {
    throw new Error(`host nội bộ không cho phép: ${host}`);
  }
}
