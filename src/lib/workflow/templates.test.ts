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

describe("B2 — judge-verify + scheduled-triage", () => {
  test("judge node dùng structured output enum, condition eq trên field (KHÔNG contains trên free-text)", () => {
    const t = getTemplate("digest-judge-verify")!;
    const judge = t.graph.nodes.find((n) => n.id === "judge");
    expect(judge?.kind).toBe("agent");
    const fmt = (judge as { format?: { properties?: { verdict?: { enum?: string[] } } } }).format;
    expect(fmt?.properties?.verdict?.enum).toEqual(["PASS", "FAIL"]);
    const check = t.graph.nodes.find((n) => n.id === "check");
    expect(check && "when" in check && check.when).toMatchObject({
      left: "{{steps.judge.output.verdict}}", op: "eq", right: "PASS",
    });
  });

  test("guard của scheduled-triage cũng dùng format enum thay vì eq trên text tự do", () => {
    const t = getTemplate("scheduled-triage")!;
    const guard = t.graph.nodes.find((n) => n.id === "guard");
    const fmt = (guard as { format?: { properties?: { status?: { enum?: string[] } } } }).format;
    expect(fmt?.properties?.status?.enum).toEqual(["stuck", "clear"]);
  });

  test("không template nào tham chiếu biến trigger.* không tồn tại (trigger thật chỉ có {source})", () => {
    // Rule 13: {{trigger.date}} từng bị bịa ra — khoá vĩnh viễn.
    const raw = JSON.stringify(TEMPLATES);
    expect(raw).not.toMatch(/\{\{trigger\.(?!source)/);
  });

  test("connector trong template: Demo (an toàn) HOẶC write gated có recipient TĨNH (không nội suy từ model)", () => {
    // Bất biến (mở rộng 2026-07-10): template không được kích hoạt write ngoài ngoài ý muốn.
    // Demo connector (auth:none) an toàn tuyệt đối. NGOẠI LỆ được họp phê duyệt: gmail_send
    // trong template báo cáo — write gated bởi WORKFLOW_RECIPIENT_ALLOWLIST + dry-run mock.
    // Điều kiện: recipient PHẢI là chuỗi TĨNH (Rule 13 — model KHÔNG được chọn đích gửi).
    for (const t of TEMPLATES) {
      for (const n of t.graph.nodes) {
        if (n.kind !== "connector") continue;
        if (n.connectorId === "demo") continue;
        const to = (n.args as { to?: unknown }).to;
        expect(
          typeof to === "string" && !/\{\{/.test(to),
          `template "${t.id}" node "${n.id}": connector ngoài Demo phải có recipient tĩnh (không {{...}})`,
        ).toBe(true);
      }
    }
  });
});

describe("P — template báo cáo đa nguồn song song", () => {
  test("multi-source-report-email: parallel:true, hình kim cương fan-out 3 + fan-in", () => {
    const t = getTemplate("multi-source-report-email")!;
    expect(t.graph.parallel).toBe(true);
    // brief fan-out tới 3 nhánh
    const fromBrief = t.graph.edges.filter((e) => e.from === "brief").map((e) => e.to).sort();
    expect(fromBrief).toEqual(["fetch_tasks", "research_laam", "research_web"]);
    // synthesis fan-in từ 3 nhánh
    const intoSynthesis = t.graph.edges.filter((e) => e.to === "synthesis").map((e) => e.from).sort();
    expect(intoSynthesis).toEqual(["fetch_tasks", "research_laam", "research_web"]);
    // gmail_send là node cuối (write duy nhất, sau join)
    const send = t.graph.nodes.find((n) => n.id === "send");
    expect(send).toMatchObject({ kind: "connector", connectorId: "gmail", action: "gmail_send" });
  });

  test("Rule 13: body email nối {{steps.research_laam.output}} verbatim (số liệu đi 1 hop, độc lập synthesis)", () => {
    const send = getTemplate("multi-source-report-email")!.graph.nodes.find((n) => n.id === "send");
    const body = String((send as { args: Record<string, unknown> }).args.body);
    expect(body).toContain("{{steps.research_laam.output}}");
  });
});
