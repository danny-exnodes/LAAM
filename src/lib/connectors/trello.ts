// Trello connector — auth with an API key + a token (both secret).
// Get the API key at trello.com/app-key, then generate a token from the same
// page. The token is scoped to your account and grants read/write access.
import type { Connector } from "./types";

const API = "https://api.trello.com/1";

// Build a Trello URL with key+token (+ any extra query params) and call it.
async function trello(
  pathname: string,
  creds: Record<string, string>,
  params: Record<string, unknown> = {},
  init: RequestInit = {},
): Promise<unknown> {
  const qs = new URLSearchParams({ key: (creds && creds.key) || "", token: (creds && creds.token) || "" });
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") qs.set(k, String(v));
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(API + pathname + "?" + qs.toString(), {
      headers: { Accept: "application/json", "User-Agent": "LAAM-connector/0.1" },
      signal: ctrl.signal,
      ...init,
    });
    const text = await r.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!r.ok) {
      const b = body as { message?: string };
      const msg = (b && b.message) || (typeof body === "string" && body) || "HTTP " + r.status;
      throw new Error(msg);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

const board = (b: Record<string, unknown>) => ({
  id: b.id,
  name: b.name,
  closed: b.closed,
  url: b.shortUrl || b.url,
  lastActivity: b.dateLastActivity,
});

const card = (c: Record<string, unknown>) => ({
  id: c.id,
  name: c.name,
  idList: c.idList,
  closed: c.closed,
  due: c.due,
  labels: ((c.labels as { name?: string; color?: string }[]) || []).map((l) => l.name || l.color),
  url: c.shortUrl || c.url,
});

const trelloConnector: Connector = {
  id: "trello",
  name: "Trello",
  icon: "clipboard-list",
  blurb: "Boards, lists, cards",
  auth: {
    type: "token",
    help: 'Lấy API Key tại trello.com/app-key. Trên cùng trang đó, bấm "Token" để tạo một token. Dán cả hai vào đây — LAAM lưu phía máy chủ, không gửi đi đâu khác.',
    fields: [
      { key: "key", label: "API Key", placeholder: "Trello API key", secret: true },
      { key: "token", label: "Token", placeholder: "Trello token", secret: true },
    ],
  },
  tools: [
    {
      type: "function",
      kind: "read",
      function: {
        name: "trello_list_boards",
        description: "Liệt kê các bảng (board) Trello của người dùng.",
        parameters: {
          type: "object",
          properties: { limit: { type: "number", description: "số lượng tối đa, mặc định 15" } },
        },
      },
    },
    {
      type: "function",
      kind: "read",
      function: {
        name: "trello_list_cards",
        description:
          'Liệt kê các thẻ (card) Trello. Nêu "boardId" để lấy card của một bảng cụ thể; bỏ trống để lấy các card được giao cho người dùng.',
        parameters: {
          type: "object",
          properties: {
            boardId: { type: "string", description: "ID của board (tuỳ chọn)" },
            limit: { type: "number", description: "số lượng tối đa, mặc định 15" },
          },
        },
      },
    },
    {
      type: "function",
      kind: "write",
      function: {
        name: "trello_create_card",
        description: "Tạo một thẻ (card) Trello mới trong một danh sách (list).",
        parameters: {
          type: "object",
          properties: {
            idList: { type: "string", description: "ID của list để thêm card vào" },
            name: { type: "string", description: "tiêu đề card" },
            desc: { type: "string", description: "mô tả card (tuỳ chọn)" },
          },
          required: ["idList", "name"],
        },
      },
    },
    {
      type: "function",
      kind: "read",
      function: {
        name: "trello_list_lists",
        description: "Liệt kê các danh sách (list) trong một bảng (board) Trello.",
        parameters: {
          type: "object",
          properties: {
            boardId: { type: "string", description: "ID của board" },
          },
          required: ["boardId"],
        },
      },
    },
    {
      type: "function",
      kind: "read",
      function: {
        name: "trello_get_card",
        description: "Lấy chi tiết một thẻ (card) Trello theo ID.",
        parameters: {
          type: "object",
          properties: {
            cardId: { type: "string", description: "ID của card" },
          },
          required: ["cardId"],
        },
      },
    },
    {
      type: "function",
      kind: "write",
      function: {
        name: "trello_update_card",
        description: "Cập nhật một thẻ (card) Trello: đổi tên, mô tả, hoặc chuyển sang list khác.",
        parameters: {
          type: "object",
          properties: {
            cardId: { type: "string", description: "ID của card" },
            name: { type: "string", description: "tiêu đề mới (tuỳ chọn)" },
            desc: { type: "string", description: "mô tả mới (tuỳ chọn)" },
            idList: { type: "string", description: "ID của list để chuyển card sang (tuỳ chọn)" },
          },
          required: ["cardId"],
        },
      },
    },
    {
      type: "function",
      kind: "write",
      function: {
        name: "trello_comment_card",
        description: "Thêm một bình luận (comment) vào một thẻ (card) Trello.",
        parameters: {
          type: "object",
          properties: {
            cardId: { type: "string", description: "ID của card" },
            text: { type: "string", description: "nội dung bình luận" },
          },
          required: ["cardId", "text"],
        },
      },
    },
  ],
  handlers: {
    async trello_list_boards(args, creds) {
      const limit = Math.min(Number(args.limit) || 15, 15);
      const data = await trello("/members/me/boards", creds, {
        fields: "name,closed,shortUrl,dateLastActivity",
      });
      return { boards: (Array.isArray(data) ? data : []).slice(0, limit).map(board) };
    },
    async trello_list_cards(args, creds) {
      const limit = Math.min(Number(args.limit) || 15, 15);
      const p = args.boardId
        ? `/boards/${encodeURIComponent(String(args.boardId))}/cards`
        : "/members/me/cards";
      const data = await trello(p, creds, { fields: "name,idList,closed,due,labels,shortUrl" });
      return { cards: (Array.isArray(data) ? data : []).slice(0, limit).map(card) };
    },
    async trello_create_card(args, creds) {
      const data = await trello(
        "/cards",
        creds,
        { idList: args.idList, name: args.name, desc: args.desc || "" },
        { method: "POST" },
      );
      return { card: card((data as Record<string, unknown>) || {}) };
    },
    async trello_list_lists(args, creds) {
      const data = await trello(
        `/boards/${encodeURIComponent(String(args.boardId))}/lists`,
        creds,
        { fields: "name,closed" },
      );
      return {
        lists: (Array.isArray(data) ? data : []).map((l: Record<string, unknown>) => ({
          id: l.id,
          name: l.name,
          closed: l.closed,
        })),
      };
    },
    async trello_get_card(args, creds) {
      const data = await trello(`/cards/${encodeURIComponent(String(args.cardId))}`, creds, {
        fields: "name,idList,closed,due,labels,shortUrl",
      });
      return { card: card((data as Record<string, unknown>) || {}) };
    },
    async trello_update_card(args, creds) {
      const params: Record<string, unknown> = {};
      if (args.name != null) params.name = args.name;
      if (args.desc != null) params.desc = args.desc;
      if (args.idList != null) params.idList = args.idList;
      const data = await trello(
        `/cards/${encodeURIComponent(String(args.cardId))}`,
        creds,
        params,
        { method: "PUT" },
      );
      return { card: card((data as Record<string, unknown>) || {}) };
    },
    async trello_comment_card(args, creds) {
      const data = await trello(
        `/cards/${encodeURIComponent(String(args.cardId))}/actions/comments`,
        creds,
        { text: args.text },
        { method: "POST" },
      );
      return { ok: true, id: (data as Record<string, unknown>)?.id };
    },
  },
  async test(creds) {
    const me = (await trello("/members/me", creds, { fields: "username,fullName" })) as {
      username?: string;
      fullName?: string;
    };
    return { ok: true, info: "Đã kết nối Trello: @" + (me.username || me.fullName || "?") };
  },
};

export default trelloConnector;
