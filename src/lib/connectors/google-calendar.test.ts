import { afterEach, describe, expect, test, vi } from "vitest";
import gcal from "./google-calendar";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("google-calendar connector", () => {
  test("identity + tool name", () => {
    expect(gcal.id).toBe("google-calendar");
    expect(gcal.tools.map((t) => t.function.name)).toEqual([
      "gcal_list_events",
      "gcal_list_calendars",
      "gcal_search_events",
      "gcal_create_event",
    ]);
  });

  test("every tool declares a read/write kind; create-event is the only write", () => {
    for (const t of gcal.tools) {
      expect(t.type).toBe("function");
      expect(["read", "write"]).toContain(t.kind);
    }
    const writes = gcal.tools.filter((t) => t.kind === "write").map((t) => t.function.name);
    expect(writes).toEqual(["gcal_create_event"]);
  });

  test("write scope calendar.events is requested for re-consent", () => {
    expect(gcal.auth.scopes).toContain("https://www.googleapis.com/auth/calendar.events");
    // existing read scopes preserved
    expect(gcal.auth.scopes).toContain("https://www.googleapis.com/auth/calendar.readonly");
    expect(gcal.auth.scopes).toContain("openid");
    expect(gcal.auth.scopes).toContain("email");
  });

  test("gcal_list_events maps event start/end/title", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({
        items: [
          {
            id: "e1",
            summary: "Standup",
            start: { dateTime: "2026-06-04T09:00:00Z" },
            end: { dateTime: "2026-06-04T09:15:00Z" },
            location: "Zoom",
            htmlLink: "u",
          },
        ],
      }),
    );
    const r = (await gcal.handlers.gcal_list_events({}, { access_token: "ya29" })) as {
      events: { id: string; title: string; start: string; end: string; location: string }[];
    };
    expect(r.events[0]).toMatchObject({
      id: "e1",
      title: "Standup",
      start: "2026-06-04T09:00:00Z",
      end: "2026-06-04T09:15:00Z",
      location: "Zoom",
    });
  });

  test("event without summary falls back to placeholder title", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ items: [{ id: "e2", start: { date: "2026-06-05" } }] }),
    );
    const r = (await gcal.handlers.gcal_list_events({}, { access_token: "ya29" })) as {
      events: { title: string; start: string; end: null; location: null }[];
    };
    expect(r.events[0].title).toBe("(không tiêu đề)");
    expect(r.events[0].start).toBe("2026-06-05");
    expect(r.events[0].end).toBeNull();
  });

  test("gcal_list_calendars maps id/summary/primary", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({
        items: [
          { id: "primary", summary: "Danny", primary: true },
          { id: "team@grp", summary: "Team" },
        ],
      }),
    );
    const r = (await gcal.handlers.gcal_list_calendars({}, { access_token: "ya29" })) as {
      calendars: { id: string; summary: string; primary: boolean }[];
    };
    expect(r.calendars).toEqual([
      { id: "primary", summary: "Danny", primary: true },
      { id: "team@grp", summary: "Team", primary: false },
    ]);
  });

  test("gcal_search_events sends q + optional time bounds and maps events", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({
        items: [{ id: "s1", summary: "Found", start: { dateTime: "2026-06-10T10:00:00Z" } }],
      }),
    );
    const r = (await gcal.handlers.gcal_search_events(
      { query: "planning sync", timeMin: "2026-06-01T00:00:00Z" },
      { access_token: "ya29" },
    )) as { events: { id: string; title: string }[] };
    expect(r.events[0]).toMatchObject({ id: "s1", title: "Found" });
    const url = String((spy.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("/calendar/v3/calendars/primary/events?q=planning%20sync");
    expect(url).toContain("singleEvents=true");
    expect(url).toContain("timeMin=2026-06-01T00%3A00%3A00Z");
    expect(url).not.toContain("timeMax=");
  });

  test("gcal_create_event POSTs a JSON body and returns the shaped event", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({
        id: "new1",
        summary: "Demo",
        start: { dateTime: "2026-06-12T14:00:00Z" },
        end: { dateTime: "2026-06-12T15:00:00Z" },
        htmlLink: "https://cal/new1",
      }),
    );
    const r = (await gcal.handlers.gcal_create_event(
      {
        summary: "Demo",
        start: "2026-06-12T14:00:00Z",
        end: "2026-06-12T15:00:00Z",
        description: "kickoff",
      },
      { access_token: "ya29" },
    )) as { event: { id: string; title: string; url: string } };

    expect(r.event).toMatchObject({ id: "new1", title: "Demo", url: "https://cal/new1" });

    const [calledUrl, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(calledUrl)).toContain("/calendar/v3/calendars/primary/events");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer ya29");
    expect(JSON.parse(String(init.body))).toEqual({
      summary: "Demo",
      description: "kickoff",
      start: { dateTime: "2026-06-12T14:00:00Z" },
      end: { dateTime: "2026-06-12T15:00:00Z" },
    });
  });
});
