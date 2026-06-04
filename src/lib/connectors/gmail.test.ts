import { afterEach, describe, expect, test, vi } from "vitest";
import gmail from "./gmail";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("gmail connector", () => {
  test("identity + tool names", () => {
    expect(gmail.id).toBe("gmail");
    expect(gmail.tools.map((t) => t.function.name)).toEqual(["gmail_list_messages", "gmail_search"]);
  });

  test("gmail_list_messages expands ids into subject/from", async () => {
    const spy = vi.spyOn(global, "fetch");
    // first call: the list of ids
    spy.mockResolvedValueOnce(Response.json({ messages: [{ id: "m1" }] }));
    // second call: per-message metadata
    spy.mockResolvedValueOnce(
      Response.json({
        id: "m1",
        snippet: "hi there",
        payload: {
          headers: [
            { name: "Subject", value: "Hello" },
            { name: "From", value: "a@b.com" },
            { name: "Date", value: "today" },
          ],
        },
      }),
    );
    const r = (await gmail.handlers.gmail_list_messages({}, { access_token: "ya29" })) as {
      messages: { id: string; subject: string; from: string; snippet: string }[];
    };
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]).toMatchObject({ id: "m1", subject: "Hello", from: "a@b.com", snippet: "hi there" });
  });

  test("expand is fail-soft: a failing message is skipped", async () => {
    const spy = vi.spyOn(global, "fetch");
    spy.mockResolvedValueOnce(Response.json({ messages: [{ id: "m1" }, { id: "m2" }] }));
    spy.mockResolvedValueOnce(Response.json({ error: { message: "boom" } }, { status: 500 }));
    spy.mockResolvedValueOnce(
      Response.json({ id: "m2", payload: { headers: [{ name: "Subject", value: "OK" }] } }),
    );
    const r = (await gmail.handlers.gmail_list_messages({}, { access_token: "ya29" })) as {
      messages: { id: string }[];
    };
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0].id).toBe("m2");
  });

  test("missing access token throws", async () => {
    await expect(gmail.handlers.gmail_list_messages({}, {})).rejects.toThrow(/access token/);
  });
});
