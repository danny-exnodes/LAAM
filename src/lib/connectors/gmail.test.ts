import { afterEach, describe, expect, test, vi } from "vitest";
import gmail from "./gmail";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("gmail connector", () => {
  test("identity + tool names", () => {
    expect(gmail.id).toBe("gmail");
    expect(gmail.tools.map((t) => t.function.name)).toEqual([
      "gmail_list_messages",
      "gmail_search",
      "gmail_get_message",
      "gmail_send",
    ]);
  });

  test("send scope + write tool kind", () => {
    expect(gmail.auth.scopes).toContain("https://www.googleapis.com/auth/gmail.send");
    const send = gmail.tools.find((t) => t.function.name === "gmail_send");
    expect(send?.kind).toBe("write");
    const get = gmail.tools.find((t) => t.function.name === "gmail_get_message");
    expect(get?.kind).toBe("read");
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

  test("gmail_get_message decodes base64url text/plain body + headers", async () => {
    const spy = vi.spyOn(global, "fetch");
    const bodyText = "Xin chào — this is the plain body.";
    spy.mockResolvedValueOnce(
      Response.json({
        id: "m9",
        snippet: "snippet ignored when a part exists",
        payload: {
          headers: [
            { name: "Subject", value: "Báo cáo" },
            { name: "From", value: "boss@corp.com" },
            { name: "To", value: "me@corp.com" },
            { name: "Date", value: "Mon, 1 Jan 2026" },
          ],
          // nested multipart: text/plain lives inside a child part
          mimeType: "multipart/alternative",
          parts: [
            { mimeType: "text/html", body: { data: Buffer.from("<b>nope</b>").toString("base64url") } },
            { mimeType: "text/plain", body: { data: Buffer.from(bodyText).toString("base64url") } },
          ],
        },
      }),
    );
    const r = (await gmail.handlers.gmail_get_message({ id: "m9" }, { access_token: "ya29" })) as {
      id: string;
      subject: string;
      from: string;
      to: string;
      date: string;
      body: string;
    };
    // GET to the full-format message endpoint
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("/gmail/v1/users/me/messages/m9?format=full");
    expect(r).toMatchObject({
      id: "m9",
      subject: "Báo cáo",
      from: "boss@corp.com",
      to: "me@corp.com",
      date: "Mon, 1 Jan 2026",
      body: bodyText,
    });
  });

  test("gmail_get_message falls back to snippet when no body", async () => {
    const spy = vi.spyOn(global, "fetch");
    spy.mockResolvedValueOnce(Response.json({ id: "m0", snippet: "only a snippet" }));
    const r = (await gmail.handlers.gmail_get_message({ id: "m0" }, { access_token: "ya29" })) as {
      body: string;
      subject: string | null;
    };
    expect(r.body).toBe("only a snippet");
    expect(r.subject).toBeNull();
  });

  test("gmail_send POSTs a base64url raw message containing to/subject", async () => {
    const spy = vi.spyOn(global, "fetch");
    spy.mockResolvedValueOnce(Response.json({ id: "sent123" }));
    const r = (await gmail.handlers.gmail_send(
      { to: "friend@x.com", subject: "Chào bạn", body: "Nội dung thư." },
      { access_token: "ya29" },
    )) as { ok: boolean; id: string };

    expect(r).toEqual({ ok: true, id: "sent123" });
    // POST to the send endpoint
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/gmail/v1/users/me/messages/send");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");

    // the JSON body carries a `raw` field; decoding it reveals the RFC 2822 message
    const sent = JSON.parse(String(init.body)) as { raw: string };
    expect(sent.raw).toBeTruthy();
    const decoded = Buffer.from(sent.raw, "base64url").toString("utf8");
    expect(decoded).toContain("To: friend@x.com");
    expect(decoded).toContain("Subject: Chào bạn");
    expect(decoded).toContain("Nội dung thư.");
  });
});

describe("gmail_send hardening (F1 sanitize + F2 canonical recipients)", () => {
  test("F1: CRLF in `to` → throw, no fetch (header injection)", async () => {
    const spy = vi.spyOn(global, "fetch");
    await expect(
      gmail.handlers.gmail_send({ to: "ok@x.com\r\nBcc: evil@y.com", subject: "s", body: "b" }, { access_token: "ya29" }),
    ).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });

  test("F1: CRLF in `subject` → throw, no fetch (header injection)", async () => {
    const spy = vi.spyOn(global, "fetch");
    await expect(
      gmail.handlers.gmail_send({ to: "ok@x.com", subject: "hi\r\nBcc: evil@y.com", body: "b" }, { access_token: "ya29" }),
    ).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });

  test("F2: `To:` rebuilt from canonical parse (lowercased, joined) — gate-seen == sent", async () => {
    const spy = vi.spyOn(global, "fetch");
    spy.mockResolvedValueOnce(Response.json({ id: "s1" }));
    await gmail.handlers.gmail_send({ to: "Alice@X.com,  Bob@Y.com ", subject: "s", body: "b" }, { access_token: "ya29" });
    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    const decoded = Buffer.from((JSON.parse(String(init.body)) as { raw: string }).raw, "base64url").toString("utf8");
    expect(decoded).toContain("To: alice@x.com, bob@y.com");
  });

  test("F2: display-name / brackets in `to` → throw, no fetch", async () => {
    const spy = vi.spyOn(global, "fetch");
    await expect(
      gmail.handlers.gmail_send({ to: '"Evil" <a@x.com>', subject: "s", body: "b" }, { access_token: "ya29" }),
    ).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });

  test("multi-line body (newlines) is ALLOWED — digest case, not over-blocked", async () => {
    const spy = vi.spyOn(global, "fetch");
    spy.mockResolvedValueOnce(Response.json({ id: "s2" }));
    const body = "Tóm tắt:\n- agent1: 3h\n- agent2: lỗi\n";
    const r = (await gmail.handlers.gmail_send(
      { to: "me@x.com", subject: "Digest", body },
      { access_token: "ya29" },
    )) as { ok: boolean };
    expect(r.ok).toBe(true);
    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    const decoded = Buffer.from((JSON.parse(String(init.body)) as { raw: string }).raw, "base64url").toString("utf8");
    expect(decoded).toContain(body); // newlines preserved verbatim in the body
  });
});
