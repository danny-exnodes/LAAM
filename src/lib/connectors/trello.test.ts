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
      "trello_list_lists",
      "trello_get_card",
      "trello_update_card",
      "trello_comment_card",
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

  test("trello_list_lists shapes lists", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: "li1", name: "Todo", closed: false },
          { id: "li2", name: "Done", closed: true },
        ]),
      ),
    );
    const r = (await trello.handlers.trello_list_lists(
      { boardId: "b1" },
      { key: "k", token: "t" },
    )) as { lists: { id: string; name: string; closed: boolean }[] };
    expect(r.lists).toEqual([
      { id: "li1", name: "Todo", closed: false },
      { id: "li2", name: "Done", closed: true },
    ]);
    expect(String(spy.mock.calls[0][0])).toContain("/boards/b1/lists");
  });

  test("trello_get_card shapes card", async () => {
    const spy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "c1", name: "Card", idList: "l1", labels: [], shortUrl: "u" })),
      );
    const r = (await trello.handlers.trello_get_card(
      { cardId: "c1" },
      { key: "k", token: "t" },
    )) as { card: { id: string; name: string; url: string } };
    expect(r.card).toMatchObject({ id: "c1", name: "Card", url: "u" });
    expect(String(spy.mock.calls[0][0])).toContain("/cards/c1");
  });

  test("trello_update_card PUTs only provided fields and shapes card", async () => {
    const spy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "c1", name: "Renamed", idList: "l2", labels: [] })));
    const r = (await trello.handlers.trello_update_card(
      { cardId: "c1", name: "Renamed", idList: "l2" },
      { key: "k", token: "t" },
    )) as { card: { id: string; name: string; idList: string } };
    expect(r.card).toMatchObject({ id: "c1", name: "Renamed", idList: "l2" });
    expect(spy.mock.calls[0][1]).toMatchObject({ method: "PUT" });
    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain("/cards/c1");
    expect(url).toContain("name=Renamed");
    expect(url).toContain("idList=l2");
    expect(url).not.toContain("desc=");
  });

  test("trello_comment_card POSTs text and returns id", async () => {
    const spy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "a1" })));
    const r = (await trello.handlers.trello_comment_card(
      { cardId: "c1", text: "hello" },
      { key: "k", token: "t" },
    )) as { ok: boolean; id: string };
    expect(r).toMatchObject({ ok: true, id: "a1" });
    expect(spy.mock.calls[0][1]).toMatchObject({ method: "POST" });
    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain("/cards/c1/actions/comments");
    expect(url).toContain("text=hello");
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
