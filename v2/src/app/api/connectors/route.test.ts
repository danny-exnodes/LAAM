import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/connectors", () => ({ list: vi.fn() }));

import { auth } from "@/auth";
import { list } from "@/lib/connectors";
import { GET } from "./route";

const mockAuth = vi.mocked(auth);
const mockList = vi.mocked(list);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/connectors", () => {
  test("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });

  test("returns connectors for the logged-in user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    const items = [{ id: "github", connected: false }];
    mockList.mockResolvedValue(items as never);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith("u1");
    expect(await res.json()).toEqual({ connectors: items });
  });
});
