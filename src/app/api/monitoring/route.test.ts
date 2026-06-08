import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/monitoring/read-model", () => ({ getMonitoredRuns: vi.fn(async () => []) }));

import { auth } from "@/auth";
import { getMonitoredRuns } from "@/lib/monitoring/read-model";
import { GET } from "./route";

const mockAuth = vi.mocked(auth);
const mockGet = vi.mocked(getMonitoredRuns);

beforeEach(() => vi.clearAllMocks());

describe("GET /api/monitoring", () => {
  test("401 when logged out", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET(new Request("http://x/api/monitoring"));
    expect(res.status).toBe(401);
    expect(mockGet).not.toHaveBeenCalled();
  });

  test("passes viewer + valid source/limit; returns runs", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    mockGet.mockResolvedValue([{ id: "r1" }] as never);
    const res = await GET(new Request("http://x/api/monitoring?source=chat&limit=5"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ runs: [{ id: "r1" }] });
    expect(mockGet).toHaveBeenCalledWith({ userId: "u1", role: "member" }, { source: "chat", limit: 5 });
  });

  test("ignores an unknown source value (no source filter)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" } } as never);
    await GET(new Request("http://x/api/monitoring?source=bogus"));
    expect(mockGet).toHaveBeenCalledWith({ userId: "u1", role: "member" }, {});
  });
});
