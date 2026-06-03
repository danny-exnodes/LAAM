import { describe, expect, test } from "vitest";
import demo from "./demo";

describe("demo connector", () => {
  test("identity + no-auth", () => {
    expect(demo.id).toBe("demo");
    expect(demo.auth.type).toBe("none");
    expect(demo.tools.map((t) => t.function.name)).toEqual(["demo_list_tasks"]);
    expect(typeof demo.handlers.demo_list_tasks).toBe("function");
  });

  test("demo_list_tasks returns all tasks offline (no creds needed)", async () => {
    const r = (await demo.handlers.demo_list_tasks({}, {})) as { tasks: unknown[] };
    expect(r.tasks).toHaveLength(4);
  });

  test("demo_list_tasks filters by status", async () => {
    const r = (await demo.handlers.demo_list_tasks({ status: "done" }, {})) as {
      tasks: { id: string }[];
    };
    expect(r.tasks).toHaveLength(1);
    expect(r.tasks[0].id).toBe("T-104");
  });
});
