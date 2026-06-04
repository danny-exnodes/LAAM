import { describe, expect, test, vi } from "vitest";
import { withSafety, PendingWriteSignal } from "./gate";
import type { Tool } from "../types";

const internal: Tool[] = [
  { name: "laam_list_agents", description: "", kind: "read", parameters: {}, handler: async () => ({}) },
];

describe("withSafety", () => {
  test("read tool → gọi inner, kết quả redacted (vá lỗ hổng connector)", async () => {
    const inner = vi.fn(async () => ({ url: "x?token=abc123def456ghi" }));
    const d = withSafety(inner, { internal });
    const r = (await d("github_list_repos", {})) as { url: string };
    expect(inner).toHaveBeenCalledOnce();
    expect(r.url).toContain("‹redacted›");
  });
  test("write chưa confirm → throw PendingWriteSignal, inner KHÔNG gọi", async () => {
    const inner = vi.fn(async () => ({ ok: true }));
    const d = withSafety(inner, { internal });
    await expect(d("trello_create_card", { idList: "l1", name: "X" })).rejects.toBeInstanceOf(
      PendingWriteSignal,
    );
    expect(inner).not.toHaveBeenCalled();
  });
  test("PendingWriteSignal mang tool + args đã parse (kể cả args dạng chuỗi JSON)", async () => {
    const d = withSafety(async () => ({}), { internal });
    await expect(
      d("trello_create_card", JSON.stringify({ idList: "l1", name: "X" })),
    ).rejects.toMatchObject({ tool: "trello_create_card", args: { idList: "l1", name: "X" } });
  });
  test("write đã confirm (confirmedAction khớp tên) → gọi inner đúng 1 lần", async () => {
    const inner = vi.fn(async () => ({ card: { id: "c1" } }));
    const d = withSafety(inner, {
      internal,
      confirmedAction: { name: "trello_create_card", args: { idList: "l1", name: "X" } },
    });
    const r = await d("trello_create_card", { idList: "l1", name: "X" });
    expect(inner).toHaveBeenCalledOnce();
    expect(r).toEqual({ card: { id: "c1" } });
  });
});
