import { describe, expect, test } from "vitest";
import { TEMPLATES, getTemplate } from "./templates";
import { assertRunnable } from "./validate";

describe("TEMPLATES catalog", () => {
  test("có ít nhất 2 template moatLeaning=true", () => {
    const moat = TEMPLATES.filter((t) => t.moatLeaning === true);
    expect(moat.length).toBeGreaterThanOrEqual(2);
  });

  test("mọi template graph đều pass assertRunnable", () => {
    for (const t of TEMPLATES) {
      expect(() => assertRunnable(t.graph), `template "${t.id}" graph failed assertRunnable`).not.toThrow();
    }
  });

  test("ids phải duy nhất", () => {
    const ids = TEMPLATES.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test("getTemplate trả về đúng template theo id", () => {
    const t = getTemplate("digest-overnight-agents");
    expect(t).toBeDefined();
    expect(t!.id).toBe("digest-overnight-agents");
    expect(t!.moatLeaning).toBe(true);
  });

  test("getTemplate trả về undefined khi id không tồn tại", () => {
    expect(getTemplate("nonexistent-id")).toBeUndefined();
  });

  test("mọi template có id, name, description, graph hợp lệ", () => {
    for (const t of TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.graph).toBeDefined();
      expect(Array.isArray(t.graph.nodes)).toBe(true);
      expect(Array.isArray(t.graph.edges)).toBe(true);
    }
  });
});
