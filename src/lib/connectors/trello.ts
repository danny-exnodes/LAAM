// Trello connector — auth with an API key + a token (both secret).
// The API key comes from an app created at trello.com/power-ups/admin (the old
// trello.com/app-key page is dead since ~2023); the token is minted via LAAM's
// 1-click authorize accelerator or the link on the app's API Key tab.
// Key + token travel in the Authorization header (docs-preferred form) so they
// stay out of proxy/access logs; only ordinary params go in the query string.
import type { Connector } from "./types";
import { OAuthError } from "./oauth/types";

const API = "https://api.trello.com/1";

// Build a Trello URL (extra query params only) and call it with key+token in
// the Authorization header.
async function trello(
  pathname: string,
  creds: Record<string, string>,
  params: Record<string, unknown> = {},
  init: RequestInit = {},
): Promise<unknown> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") qs.set(k, String(v));
  }
  const q = qs.toString();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(API + pathname + (q ? "?" + q : ""), {
      headers: {
        Accept: "application/json",
        Authorization:
          'OAuth oauth_consumer_key="' +
          ((creds && creds.key) || "") +
          '", oauth_token="' +
          ((creds && creds.token) || "") +
          '"',
        "User-Agent": "LAAM-connector/0.1",
      },
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
      // 401 = "invalid token" (revoked) / "invalid key": the grant is dead.
      // OAuthError(_, true) flips the connector to needs_reconnect so the UI
      // offers the one-click re-authorize.
      if (r.status === 401) throw new OAuthError(msg, true);
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
    help:
      'Tạo app tại trello.com/power-ups/admin (trang trello.com/app-key cũ đã ngừng hoạt động): bấm "New", điền tên app và Workspace, bỏ trống "Iframe connector URL". Mở tab "API Key" → bấm "Generate a new API Key" rồi copy API Key — KHÔNG copy ô "Secret" bên cạnh (dán nhầm Secret là nguyên nhân phổ biến của lỗi 401 "invalid key"). Token: dùng nút uỷ quyền 1-click của LAAM khi server đã cấu hình TRELLO_API_KEY, hoặc tự tạo token từ liên kết trên trang API Key. Lưu ý cho người vận hành: phải thêm origin của LAAM vào "Allowed origins" của app thì luồng uỷ quyền mới hoạt động. LAAM lưu cả hai phía máy chủ, không gửi đi đâu khác.',
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
        description:
          "Tạo một thẻ (card) Trello mới trong một danh sách (list). Gọi khi người dùng yêu cầu tạo/thêm card mới. idList là ID của list (KHÔNG phải tên hay ID board) — lấy bằng trello_list_lists nếu chưa có.",
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
        description:
          "Cập nhật một thẻ (card) Trello: đổi tên, mô tả, hoặc chuyển sang list khác. Gọi khi người dùng yêu cầu sửa/cập nhật/di chuyển card. cardId là ID của card; idList (nếu chuyển card) là ID của list (KHÔNG phải tên hay ID board).",
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
        description:
          "Thêm một bình luận (comment) vào một thẻ (card) Trello. Gọi khi người dùng yêu cầu thêm/gửi bình luận vào card. cardId là ID của card (KHÔNG phải tên card).",
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
