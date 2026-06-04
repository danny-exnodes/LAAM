import { afterEach, describe, expect, test, vi } from "vitest";
import gcal from "./google-calendar";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("google-calendar connector", () => {
  test("identity + tool name", () => {
    expect(gcal.id).toBe("google-calendar");
    expect(gcal.tools.map((t) => t.function.name)).toEqual(["gcal_list_events"]);
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
});
