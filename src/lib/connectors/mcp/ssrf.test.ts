import { describe, expect, test } from "vitest";
import { assertSafeUrl } from "./ssrf";

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
