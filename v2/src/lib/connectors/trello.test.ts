import { afterEach, describe, expect, test, vi } from "vitest";
import trello from "./trello";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("trello connector", () => {
  test("identity + tool names", () => {
    expect(trello.id).toBe("trello");
    expect(trello.tools.map((t) => t.function.name)).toEqual([
      "trello_list_boards",
      "trello_list_cards",
      "trello_create_card",
    ]);
  });

  test("trello_list_boards shapes board", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([{ id: "b1", name: "Board", closed: false, shortUrl: "u", dateLastActivity: "x" }]),
      ),
    );
    const r = (await trello.handlers.trello_list_boards({}, { key: "k", token: "t" })) as {
      boards: { id: string; name: string; url: string }[];
    };
    expect(r.boards[0]).toMatchObject({ id: "b1", name: "Board", url: "u" });
  });

  test("trello_create_card POSTs and shapes card", async () => {
    const spy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "c1", name: "New", idList: "l1", labels: [] })));
    const r = (await trello.handlers.trello_create_card(
      { idList: "l1", name: "New" },
      { key: "k", token: "t" },
    )) as { card: { id: string; name: string } };
    expect(r.card).toMatchObject({ id: "c1", name: "New" });
    expect(spy.mock.calls[0][1]).toMatchObject({ method: "POST" });
  });

  test("non-ok response throws message", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "invalid key" }), { status: 401 }),
    );
    await expect(trello.handlers.trello_list_boards({}, { key: "x", token: "y" })).rejects.toThrow(
      "invalid key",
    );
  });
});
