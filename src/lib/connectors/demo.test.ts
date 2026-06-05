import { describe, expect, test } from "vitest";
import demo from "./demo";

describe("demo connector", () => {
  test("identity + no-auth", () => {
    expect(demo.id).toBe("demo");
    expect(demo.auth.type).toBe("none");
    expect(demo.tools.map((t) => t.function.name)).toEqual(["demo_list_tasks", "demo_create_task"]);
    expect(typeof demo.handlers.demo_list_tasks).toBe("function");
    expect(typeof demo.handlers.demo_create_task).toBe("function");
  });

  test("demo_create_task creates a task offline (FEAT-5 write-gate fixture)", async () => {
    const r = (await demo.handlers.demo_create_task({ title: "Chuẩn bị họp" }, {})) as {
      created: { title: string; status: string };
    };
    expect(r.created.title).toBe("Chuẩn bị họp");
    expect(r.created.status).toBe("todo");
  });

  test("demo_create_task requires a title", async () => {
    const r = (await demo.handlers.demo_create_task({}, {})) as { error?: string };
    expect(r.error).toBeTruthy();
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
