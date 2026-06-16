// SSRF guard for user-supplied MCP server URLs. A remote MCP server is fetched
// server-side with the user's auth token, so an attacker who can set the URL could
// otherwise pivot to internal services or the cloud metadata endpoint.
//
// Two layers:
//   - assertSafeUrl(url)          — synchronous literal check (protocol + literal host/IP).
//                                    Cheap, used at config time (store.ts) to reject obviously
//                                    internal URLs on save.
//   - assertSafeUrlResolved(url)  — async: the literal check PLUS DNS resolution, validating
//                                    EVERY resolved IP. Used at connect time (client.ts) so a
//                                    PUBLIC hostname whose A/AAAA record points at a private /
//                                    metadata IP is caught — the gap the old config-only check
//                                    could not see.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// IPv4 octet-range check — loopback / private / link-local / unspecified, incl. the
// 169.254.169.254 cloud-metadata endpoint.
function isBlockedIPv4(ip: string): boolean {
  const o = ip.split(".");
  if (o.length !== 4 || !o.every((x) => /^\d{1,3}$/.test(x) && Number(x) <= 255)) return false;
  const [a, b] = o.map(Number);
  return (
    a === 0 || // 0.0.0.0/8 unspecified
    a === 127 || // 127.0.0.0/8 loopback
    a === 10 || // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 169 && b === 254) // 169.254.0.0/16 link-local (incl. metadata)
  );
}

// IPv6 — loopback (::1), unspecified (::), link-local (fe80::/10), unique-local (fc00::/7),
// and IPv4-mapped / -compatible addresses whose embedded IPv4 is itself blocked.
function isBlockedIPv6(ip: string): boolean {
  let h = ip.toLowerCase();
  const zone = h.indexOf("%"); // strip zone id, e.g. fe80::1%eth0
  if (zone >= 0) h = h.slice(0, zone);
  if (h === "::1" || h === "::") return true;
  // ::ffff:a.b.c.d (mapped) / ::a.b.c.d (compatible) → validate the embedded IPv4.
  const v4 = h.match(/(?:^|:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4 && isBlockedIPv4(v4[1])) return true;
  if (/^fe[89ab]/.test(h)) return true; // fe80::/10 link-local
  if (/^f[cd]/.test(h)) return true; // fc00::/7 unique-local
  return false;
}

// True when `ip` (a literal IPv4/IPv6 string) sits in a private/reserved/loopback/link-local
// range a server-side fetch must never reach. Non-IP input → false (host names go through DNS).
export function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isBlockedIPv4(ip);
  if (v === 6) return isBlockedIPv6(ip);
  return false;
}

// Literal/config-time check: reject non-http(s) and any loopback / private / link-local /
// unspecified literal host (incl. 169.254.169.254) or a *.local mDNS name. Does NOT resolve DNS.
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

  if (host === "localhost") {
    throw new Error(`host nội bộ không cho phép: ${host}`);
  }
  // mDNS / local domains (covers "foo.local", "printer.local").
  if (host === "local" || host.endsWith(".local")) {
    throw new Error(`host nội bộ không cho phép: ${host}`);
  }
  // Literal IPv4/IPv6 in a blocked range (subsumes 0.0.0.0, ::, ::1, 169.254.169.254, …).
  if (isBlockedIp(host)) {
    throw new Error(`IP nội bộ không cho phép: ${host}`);
  }
}

// Resolve a host to its IP addresses. Injectable so the connect-time check can be unit-tested
// without real DNS; production uses node's resolver.
export type DnsResolver = (host: string) => Promise<string[]>;
const defaultResolver: DnsResolver = async (host) => (await lookup(host, { all: true })).map((a) => a.address);

// Connect-time check: the literal guard PLUS DNS resolution, validating EVERY resolved address.
// This is what closes the DNS-rebind hole — a public hostname whose record points at a private
// or metadata IP. Fail-closed: any resolved private IP, or an unresolvable host, throws.
//
// Residual limitation (documented, follow-up): the transport re-resolves the host on its own
// socket, so a sub-second rebind BETWEEN this check and the actual connect is still theoretically
// possible (TOCTOU). Fully closing that needs a pinned-IP dispatcher, which requires adding the
// `undici` dependency — deferred. This check still raises the bar from "no DNS check at all".
export async function assertSafeUrlResolved(url: string, resolve: DnsResolver = defaultResolver): Promise<void> {
  assertSafeUrl(url); // protocol + literal host + *.local — throws before any DNS work
  const host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(host)) return; // already a validated literal IP
  let addrs: string[];
  try {
    addrs = await resolve(host);
  } catch {
    throw new Error(`không phân giải được host: ${host}`);
  }
  for (const ip of addrs) {
    if (isBlockedIp(ip)) {
      throw new Error(`host '${host}' phân giải tới IP nội bộ ${ip} (SSRF chặn)`);
    }
  }
}
