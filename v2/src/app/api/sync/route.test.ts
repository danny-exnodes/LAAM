import { afterEach, describe, expect, test, vi } from "vitest";

// Hoisted mock state. We mock the data layer (syncLocalMonitoring) and the
// events-bus so we can assert the route fans a sync event out to SSE clients.
const h = vi.hoisted(() => ({
  authResult: null as { user?: { id: string } } | null,
  syncResult: { added: 0 } as unknown,
  syncThrows: false,
  publish: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => h.authResult) }));
vi.mock("@/lib/sync", () => ({
  syncLocalMonitoring: vi.fn(async () => {
    if (h.syncThrows) throw new Error("boom");
    return h.syncResult;
  }),
}));
vi.mock("@/lib/events-bus", () => ({ publish: h.publish }));
const publish = h.publish;

import { POST } from "./route";
import { syncLocalMonitoring } from "@/lib/sync";

afterEach(() => {
  h.authResult = null;
  h.syncThrows = false;
  vi.clearAllMocks();
});

describe("POST /api/sync", () => {
  test("401 unauthenticated — no sync, no publish", async () => {
    h.authResult = null;
    const res = await POST();
    expect(res.status).toBe(401);
    expect(syncLocalMonitoring).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  test("publishes a sync event after a successful sync and returns the result", async () => {
    h.authResult = { user: { id: "u1" } };
    h.syncResult = { added: 3 };
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ added: 3 });
    expect(publish).toHaveBeenCalledWith({ type: "sync" });
  });

  test("does NOT publish when sync fails", async () => {
    h.authResult = { user: { id: "u1" } };
    h.syncThrows = true;
    const res = await POST();
    expect(res.status).toBe(500);
    expect(publish).not.toHaveBeenCalled();
  });
});
