// Google Calendar connector — in-app OAuth (see google-oauth.ts). The user clicks
// "Kết nối với Google"; LAAM stores the refresh token (encrypted) and refreshes the
// access token automatically. The gapi() wrapper reads creds.access_token, which
// execute() keeps fresh before each call.
import type { Connector } from "./types";

const API = "https://www.googleapis.com";

async function gapi(
  pathname: string,
  creds: Record<string, string>,
  init: RequestInit = {},
): Promise<unknown> {
  if (!creds || !creds.access_token) throw new Error("thiếu Google access token");
  const headers = {
    Authorization: "Bearer " + creds.access_token,
    Accept: "application/json",
    "User-Agent": "LAAM-connector/0.1",
    ...(init.headers as Record<string, string> | undefined),
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(API + pathname, { ...init, headers, signal: ctrl.signal });
    const body = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!r.ok) throw new Error((body && body.error && (body.error.message || "error")) || "HTTP " + r.status);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

const event = (e: Record<string, unknown>) => {
  const start = e.start as { dateTime?: string; date?: string } | undefined;
  const end = e.end as { dateTime?: string; date?: string } | undefined;
  return {
    id: e.id,
    title: (e.summary as string) || "(không tiêu đề)",
    start: (start && (start.dateTime || start.date)) || null,
    end: (end && (end.dateTime || end.date)) || null,
    location: (e.location as string) || null,
    status: e.status,
    url: e.htmlLink,
  };
};

const googleCalendar: Connector = {
  id: "google-calendar",
  name: "Google Calendar",
  icon: "clock",
  blurb: "Sự kiện sắp tới trên Google Calendar",
  auth: {
    type: "oauth",
    provider: "google",
    scopes: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    setup:
      'Bấm "Kết nối với Google" để cấp quyền đọc Google Calendar (chỉ đọc). LAAM lưu token phía máy chủ, mã hoá tại chỗ; phiên có thể cần kết nối lại sau ~7 ngày (giới hạn của Google ở chế độ thử nghiệm).',
  },
  tools: [
    {
      type: "function",
      kind: "read",
      function: {
        name: "gcal_list_events",
        description: "Liệt kê các sự kiện sắp tới trên Google Calendar chính của người dùng.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      kind: "read",
      function: {
        name: "gcal_list_calendars",
        description: "Liệt kê các lịch (calendar) mà người dùng có quyền truy cập.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      kind: "read",
      function: {
        name: "gcal_search_events",
        description: "Tìm kiếm sự kiện trên lịch chính theo từ khoá, có thể giới hạn khoảng thời gian.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Từ khoá tìm kiếm sự kiện." },
            timeMin: { type: "string", description: "Thời điểm bắt đầu (ISO 8601), tuỳ chọn." },
            timeMax: { type: "string", description: "Thời điểm kết thúc (ISO 8601), tuỳ chọn." },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      kind: "write",
      function: {
        name: "gcal_create_event",
        description: "Tạo một sự kiện mới trên Google Calendar chính của người dùng.",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Tiêu đề sự kiện." },
            start: { type: "string", description: "Thời điểm bắt đầu (ISO 8601 datetime)." },
            end: { type: "string", description: "Thời điểm kết thúc (ISO 8601 datetime)." },
            description: { type: "string", description: "Mô tả sự kiện, tuỳ chọn." },
          },
          required: ["summary", "start", "end"],
        },
      },
    },
  ],
  handlers: {
    async gcal_list_events(_args, creds) {
      const timeMin = encodeURIComponent(new Date().toISOString());
      const data = (await gapi(
        "/calendar/v3/calendars/primary/events?maxResults=15&singleEvents=true&orderBy=startTime&timeMin=" + timeMin,
        creds,
      )) as { items?: Record<string, unknown>[] };
      return { events: (data.items || []).slice(0, 15).map(event) };
    },
    async gcal_list_calendars(_args, creds) {
      const data = (await gapi("/calendar/v3/users/me/calendarList", creds)) as {
        items?: { id?: string; summary?: string; primary?: boolean }[];
      };
      return {
        calendars: (data.items || []).map((c) => ({
          id: c.id,
          summary: c.summary,
          primary: !!c.primary,
        })),
      };
    },
    async gcal_search_events(args, creds) {
      const query = String(args.query ?? "");
      let path =
        "/calendar/v3/calendars/primary/events?q=" +
        encodeURIComponent(query) +
        "&singleEvents=true&orderBy=startTime&maxResults=15";
      if (args.timeMin) path += "&timeMin=" + encodeURIComponent(String(args.timeMin));
      if (args.timeMax) path += "&timeMax=" + encodeURIComponent(String(args.timeMax));
      const data = (await gapi(path, creds)) as { items?: Record<string, unknown>[] };
      return { events: (data.items || []).map(event) };
    },
    async gcal_create_event(args, creds) {
      const data = (await gapi("/calendar/v3/calendars/primary/events", creds, {
        method: "POST",
        body: JSON.stringify({
          summary: args.summary,
          description: args.description,
          start: { dateTime: args.start },
          end: { dateTime: args.end },
        }),
        headers: { "Content-Type": "application/json" },
      })) as Record<string, unknown>;
      return { event: event(data) };
    },
  },
  async test(creds) {
    const cal = (await gapi("/calendar/v3/calendars/primary", creds)) as { summary?: string; id?: string };
    return { ok: true, info: "Đã kết nối Google Calendar: " + ((cal && (cal.summary || cal.id)) || "OK") };
  },
};

export default googleCalendar;
