import { describe, expect, test, vi } from "vitest";
vi.mock("@/db", () => ({ db: {} }));
import { loadMcpPool, resolveFromPools } from "./mcp-pool";
import type { ConnectorTool } from "@/lib/connectors/types";

const t = (name: string): ConnectorTool => ({ type: "function", kind: "read", function: { name, description: "", parameters: {} } });

describe("loadMcpPool", () => {
  // WHY fixture chứ không gọi MCP sống: eval phải chạy lại được (và trong CI) mà không
  // phụ thuộc server MCP của một máy cụ thể. Fixture chụp bằng snapshot-mcp-pool.ts.
  test("đọc được fixture đã chụp: đủ nhiều tool, schema THẬT (có properties), tên có tiền tố mcp__", () => {
    const pool = loadMcpPool();
    expect(pool.length).toBeGreaterThanOrEqual(40); // prod đang ~48
    expect(pool.every((x) => x.function.name.startsWith("mcp__"))).toBe(true);
    // Bloat thật nằm ở parameters — nếu fixture bị rút gọn thành {} thì eval đo sai điều kiện.
    const withProps = pool.filter((x) => Object.keys((x.function.parameters as { properties?: object })?.properties ?? {}).length > 0);
    expect(withProps.length).toBeGreaterThan(pool.length / 2);
  });

  test("fixture vắng mặt → [] + cảnh báo, KHÔNG ném (eval vẫn chạy được ở scale nhỏ)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(loadMcpPool("/khong/ton/tai/mcp-pool.json")).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("resolveFromPools", () => {
  test("tra tên qua NHIỀU pool theo thứ tự ưu tiên", () => {
    const got = resolveFromPools("b", [[t("a")], [t("b"), t("c")]]);
    expect(got.function.name).toBe("b");
  });

  test("không có ở pool nào → ném (probe trỏ sai tên phải đỏ ngay, không im lặng đo sai)", () => {
    expect(() => resolveFromPools("khong-co", [[t("a")]])).toThrow(/khong-co/);
  });
});
