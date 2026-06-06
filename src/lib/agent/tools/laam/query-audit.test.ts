import { describe, expect, test, vi } from "vitest";
vi.mock("@/db", () => ({ db: {} }));
import { shapeAudit, type AuditRow } from "./query-audit";

const now = Date.UTC(2026, 5, 6);

describe("shapeAudit", () => {
  test("maps action/target/createdAt to a compact entry with ISO time", () => {
    const rows: AuditRow[] = [{ action: "connector.write", target: "trello:card", createdAt: new Date(now) }];
    const out = shapeAudit(rows);
    expect(out[0].action).toBe("connector.write");
    expect(out[0].target).toBe("trello:card");
    expect(out[0].at).toBe(new Date(now).toISOString());
  });

  test("tolerates null target / createdAt", () => {
    const out = shapeAudit([{ action: "x", target: null, createdAt: null }]);
    expect(out[0].target).toBeNull();
    expect(out[0].at).toBeNull();
  });
});
