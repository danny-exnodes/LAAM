import { describe, expect, test } from "vitest";
import { NextResponse } from "next/server";
import { requireRole, requireMutator } from "./rbac";

// A session is just { user: { id, role } } for these guards — mirror the real
// (augmented) shape loosely with `as never` like the route tests do.
const sess = (role: string) => ({ user: { id: "u1", role } }) as never;

describe("requireMutator — viewer is read-only (the live RBAC hole this closes)", () => {
  // WHY: viewer/member could fire connector writes because RBAC was decorative.
  // viewer MUST be blocked on every mutation; the other three roles must pass.
  test("viewer → 403 (the regression guard)", async () => {
    const r = requireMutator(sess("viewer"));
    expect(r).toBeInstanceOf(NextResponse);
    expect((r as NextResponse).status).toBe(403);
  });

  test.each(["member", "admin", "owner"])("%s → ok (mutation allowed)", (role) => {
    expect(requireMutator(sess(role))).toEqual({ ok: true });
  });

  test("no session → 401 (not logged in)", () => {
    const r = requireMutator(null);
    expect(r).toBeInstanceOf(NextResponse);
    expect((r as NextResponse).status).toBe(401);
  });

  test("session without a role → 403 (fail closed, never default-allow)", () => {
    const r = requireMutator({ user: { id: "u1" } } as never);
    expect(r).toBeInstanceOf(NextResponse);
    expect((r as NextResponse).status).toBe(403);
  });
});

describe("requireRole — owner/admin gates (machines refactor)", () => {
  test.each(["owner", "admin"])("%s passes owner/admin gate", (role) => {
    expect(requireRole(sess(role), ["owner", "admin"])).toEqual({ ok: true });
  });

  test.each(["member", "viewer"])("%s → 403 against owner/admin gate", (role) => {
    const r = requireRole(sess(role), ["owner", "admin"]);
    expect(r).toBeInstanceOf(NextResponse);
    expect((r as NextResponse).status).toBe(403);
  });

  test("owner-only gate rejects admin", () => {
    const r = requireRole(sess("admin"), ["owner"]);
    expect(r).toBeInstanceOf(NextResponse);
    expect((r as NextResponse).status).toBe(403);
  });

  test("no session → 401", () => {
    const r = requireRole(null, ["owner", "admin"]);
    expect(r).toBeInstanceOf(NextResponse);
    expect((r as NextResponse).status).toBe(401);
  });

  test("403 body carries an error string (matches the machines route shape)", async () => {
    const r = requireRole(sess("member"), ["owner"]) as NextResponse;
    const body = await r.json();
    expect(typeof body.error).toBe("string");
  });
});
