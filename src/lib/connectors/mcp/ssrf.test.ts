import { describe, expect, test, vi } from "vitest";
import { assertSafeUrl, assertSafeUrlResolved, isBlockedIp } from "./ssrf";

// assertSafeUrlResolved takes an injectable resolver (DI) so the connect-time check is unit-
// testable without real DNS — `resolver(...ips)` stands in for dns.lookup returning those IPs.
const resolver = (...ips: string[]) => async () => ips;

describe("mcp ssrf guard", () => {
  test("rejects localhost", () => {
    expect(() => assertSafeUrl("http://localhost:3000/mcp")).toThrow();
  });

  test("rejects a private IP (192.168.x / 10.x / 172.16-31)", () => {
    expect(() => assertSafeUrl("https://192.168.1.10/mcp")).toThrow();
    expect(() => assertSafeUrl("http://10.0.0.5/mcp")).toThrow();
    expect(() => assertSafeUrl("http://172.16.0.1/mcp")).toThrow();
  });

  test("rejects the cloud metadata IP (169.254.169.254)", () => {
    expect(() => assertSafeUrl("http://169.254.169.254/latest/meta-data/")).toThrow();
  });

  test("rejects loopback IP and unspecified address", () => {
    expect(() => assertSafeUrl("http://127.0.0.1/mcp")).toThrow();
    expect(() => assertSafeUrl("http://0.0.0.0/mcp")).toThrow();
    expect(() => assertSafeUrl("http://[::1]/mcp")).toThrow();
  });

  test("rejects a *.local mDNS host", () => {
    expect(() => assertSafeUrl("http://printer.local/mcp")).toThrow();
  });

  test("rejects a non-http(s) scheme (ftp)", () => {
    expect(() => assertSafeUrl("ftp://example.com/mcp")).toThrow();
  });

  test("rejects a malformed URL", () => {
    expect(() => assertSafeUrl("not a url")).toThrow();
  });

  test("allows a normal public host", () => {
    expect(() => assertSafeUrl("https://mcp.example.com/sse")).not.toThrow();
    expect(() => assertSafeUrl("https://api.githubcopilot.com/mcp/")).not.toThrow();
    // 172.32.x is OUTSIDE the private 172.16-31 range → allowed.
    expect(() => assertSafeUrl("https://172.32.0.1/mcp")).not.toThrow();
  });
});

// isBlockedIp is the shared predicate behind both the literal check and the resolved check.
// It must cover IPv6 (loopback/link-local/ULA/IPv4-mapped), not just IPv4 — a DNS name can
// resolve to a private IPv6 just as easily as a private IPv4.
describe("isBlockedIp — private/reserved range predicate", () => {
  test("IPv4 private/reserved → blocked", () => {
    for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0"]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });
  test("IPv4 public → allowed", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "93.184.216.34"]) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });
  test("IPv6 loopback/link-local/ULA + IPv4-mapped private → blocked", () => {
    for (const ip of ["::1", "fe80::1", "febf::1", "fc00::1", "fd12:3456::1", "::ffff:169.254.169.254", "::ffff:10.0.0.1"]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });
  test("IPv6 public + IPv4-mapped public → allowed", () => {
    for (const ip of ["2001:4860:4860::8888", "::ffff:8.8.8.8"]) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });
});

// REGRESSION (adversarial review 2026-06-16): new URL() normalizes an IPv4-mapped IPv6 host to
// canonical HEX, e.g. [::ffff:169.254.169.254] → [::ffff:a9fe:a9fe]. A dotted-only check misses
// the hex form → SSRF to the metadata IP. isBlockedIp must work on the hex spelling too.
describe("isBlockedIp — IPv4-in-IPv6 in the hex form new URL() actually produces", () => {
  test("IPv4-mapped private/metadata/loopback in hex → blocked", () => {
    // a9fe:a9fe=169.254.169.254, 7f00:1=127.0.0.1, a00:1=10.0.0.1, c0a8:101=192.168.1.1, ac10:1=172.16.0.1
    for (const ip of ["::ffff:a9fe:a9fe", "::ffff:7f00:1", "::ffff:a00:1", "::ffff:c0a8:101", "::ffff:ac10:1"]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });
  test("IPv4-compatible (no ffff) private in hex → blocked", () => {
    expect(isBlockedIp("::a9fe:a9fe")).toBe(true); // ::169.254.169.254
  });
  test("IPv4-mapped PUBLIC in hex → allowed", () => {
    expect(isBlockedIp("::ffff:808:808")).toBe(false); // 8.8.8.8
    expect(isBlockedIp("::ffff:5db8:d822")).toBe(false); // 93.184.216.34
  });
  test("still blocks the dotted spellings too (defence in depth)", () => {
    expect(isBlockedIp("::ffff:169.254.169.254")).toBe(true);
    expect(isBlockedIp("::ffff:127.0.0.1")).toBe(true);
  });
});

describe("assertSafeUrl — end-to-end through URL normalization (hex IPv4-mapped regression)", () => {
  test("bracketed IPv4-mapped metadata/loopback URL → throw", () => {
    expect(() => assertSafeUrl("https://[::ffff:169.254.169.254]/")).toThrow();
    expect(() => assertSafeUrl("https://[::ffff:127.0.0.1]/mcp")).toThrow();
    expect(() => assertSafeUrl("https://[::169.254.169.254]/")).toThrow();
  });
  test("bracketed IPv4-mapped PUBLIC URL → allowed", () => {
    expect(() => assertSafeUrl("https://[::ffff:8.8.8.8]/")).not.toThrow();
  });
});

// assertSafeUrlResolved closes the DNS-rebind hole the comment in ssrf.ts admits: a PUBLIC
// hostname whose A/AAAA record points at a private/metadata IP. It resolves and validates
// EVERY returned address (fail-closed: any private address throws).
describe("assertSafeUrlResolved — DNS-aware check", () => {
  test("public hostname resolving to the metadata IP → throw (the named hole)", async () => {
    await expect(assertSafeUrlResolved("https://evil.example.com/mcp", resolver("169.254.169.254"))).rejects.toThrow();
  });

  test("public hostname resolving to a private IPv4 → throw", async () => {
    await expect(assertSafeUrlResolved("https://rebind.example.com/mcp", resolver("10.0.0.5"))).rejects.toThrow();
  });

  test("public hostname resolving to a private IPv6 → throw", async () => {
    await expect(assertSafeUrlResolved("https://rebind6.example.com/mcp", resolver("fd00::1"))).rejects.toThrow();
  });

  test("any one of several resolved IPs private → throw (all must be safe)", async () => {
    await expect(
      assertSafeUrlResolved("https://mixed.example.com/mcp", resolver("93.184.216.34", "10.1.2.3")),
    ).rejects.toThrow();
  });

  test("unresolvable host → throw (fail-closed)", async () => {
    const failing = async () => {
      throw new Error("ENOTFOUND");
    };
    await expect(assertSafeUrlResolved("https://nope.example.com/mcp", failing)).rejects.toThrow();
  });

  test("public hostname resolving to a public IP → resolves OK", async () => {
    await expect(assertSafeUrlResolved("https://good.example.com/mcp", resolver("93.184.216.34"))).resolves.toBeUndefined();
  });

  test("bad scheme / literal private IP rejected before DNS (resolver not called)", async () => {
    const spy = vi.fn(async () => ["1.2.3.4"]);
    await expect(assertSafeUrlResolved("ftp://example.com/mcp", spy)).rejects.toThrow();
    await expect(assertSafeUrlResolved("http://10.0.0.1/mcp", spy)).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});
