// Jira Cloud connector — auth with email + API token over HTTP Basic.
// Create an API token at id.atlassian.com/manage-profile/security/api-tokens.
import type { Connector } from "./types";

async function jira(
  pathname: string,
  creds: Record<string, string>,
  init: RequestInit = {},
): Promise<unknown> {
  const site = String((creds && creds.site) || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  if (!site) throw new Error("thiếu site (vd: yourcompany.atlassian.net)");
  const basic = Buffer.from(((creds && creds.email) || "") + ":" + ((creds && creds.api_token) || "")).toString("base64");
  const headers = {
    Accept: "application/json",
    Authorization: "Basic " + basic,
    "User-Agent": "LAAM-connector/0.1",
    ...((init.headers as Record<string, string>) || {}),
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch("https://" + site + pathname, { ...init, headers, signal: ctrl.signal });
    const body = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    if (!r.ok) {
      const errs = body && (body.errorMessages as string[] | undefined);
      const msg: string =
        (errs && errs[0]) ||
        (body && (body.message as string)) ||
        (body && body.errors ? JSON.stringify(body.errors) : "") ||
        "";
      throw new Error(msg || "HTTP " + r.status);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function issue(it: Record<string, unknown>, site: string) {
  const f = (it && (it.fields as Record<string, unknown>)) || {};
  const status = f.status as { name?: string } | undefined;
  const assignee = f.assignee as { displayName?: string; emailAddress?: string } | undefined;
  return {
    key: it.key,
    summary: (f.summary as string) || "",
    status: (status && status.name) || "",
    assignee: (assignee && (assignee.displayName || assignee.emailAddress)) || null,
    url: "https://" + site + "/browse/" + it.key,
  };
}

function adf(text: string) {
  return { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

async function searchIssues(jql: string, creds: Record<string, string>) {
  const site = String((creds && creds.site) || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  const params =
    "jql=" + encodeURIComponent(jql) + "&maxResults=15&fields=" + encodeURIComponent("summary,status,assignee");
  const data = (await jira("/rest/api/3/search?" + params, creds)) as {
    issues?: Record<string, unknown>[];
    total?: number;
  };
  const issues = (data && Array.isArray(data.issues) ? data.issues : [])
    .slice(0, 15)
    .map((it) => issue(it, site));
  return { total: (data && data.total) || issues.length, issues };
}

const jiraConnector: Connector = {
  id: "jira",
  name: "Jira",
  icon: "list",
  blurb: "Issues, tasks, sprints trên Jira Cloud",
  auth: {
    type: "token",
    help: "Tạo API token tại id.atlassian.com/manage-profile/security/api-tokens. Nhập \"site\" là tên miền Jira của bạn (vd: yourcompany.atlassian.net), email đăng nhập Atlassian, và dán API token. LAAM lưu phía máy chủ, không gửi đi đâu khác.",
    fields: [
      { key: "site", label: "Site (tên miền Jira)", placeholder: "yourcompany.atlassian.net" },
      { key: "email", label: "Email Atlassian", placeholder: "you@company.com" },
      { key: "api_token", label: "API Token", placeholder: "ATATT…", secret: true },
    ],
  },
  tools: [
    {
      type: "function",
      kind: "read",
      function: {
        name: "jira_search_issues",
        description:
          'Tìm issue trên Jira theo câu truy vấn JQL (vd: project = ABC AND status = "In Progress"). Trả về key, tiêu đề, trạng thái, người được giao và link.',
        parameters: {
          type: "object",
          properties: { jql: { type: "string", description: "câu truy vấn JQL" } },
          required: ["jql"],
        },
      },
    },
    {
      type: "function",
      kind: "read",
      function: {
        name: "jira_my_issues",
        description: "Liệt kê các issue Jira đang được giao cho chính người dùng, sắp xếp theo lần cập nhật gần nhất.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      kind: "read",
      function: {
        name: "jira_get_issue",
        description: "Lấy chi tiết một issue Jira theo key (vd: ABC-123). Trả về tiêu đề, trạng thái, người được giao và link.",
        parameters: {
          type: "object",
          properties: { key: { type: "string", description: "key của issue (vd: ABC-123)" } },
          required: ["key"],
        },
      },
    },
    {
      type: "function",
      kind: "read",
      function: {
        name: "jira_list_projects",
        description: "Liệt kê các project trên Jira Cloud. Trả về key, tên và id của từng project.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      kind: "write",
      function: {
        name: "jira_add_comment",
        description:
          "Thêm một bình luận vào issue Jira theo key. Gọi khi người dùng yêu cầu thêm/gửi bình luận vào issue. key là key của issue (vd: ABC-123), body là nội dung bình luận.",
        parameters: {
          type: "object",
          properties: {
            key: { type: "string", description: "key của issue (vd: ABC-123)" },
            body: { type: "string", description: "nội dung bình luận" },
          },
          required: ["key", "body"],
        },
      },
    },
    {
      type: "function",
      kind: "write",
      function: {
        name: "jira_create_issue",
        description:
          "Tạo một issue mới trên Jira. Gọi khi người dùng yêu cầu tạo/mở issue/task mới. projectKey là key của project (vd: ABC, không phải tên đầy đủ); summary là tiêu đề; issueType mặc định Task.",
        parameters: {
          type: "object",
          properties: {
            projectKey: { type: "string", description: "key của project (vd: ABC)" },
            summary: { type: "string", description: "tiêu đề issue" },
            issueType: { type: "string", description: "loại issue (mặc định Task)" },
            description: { type: "string", description: "mô tả issue (tuỳ chọn)" },
          },
          required: ["projectKey", "summary"],
        },
      },
    },
  ],
  handlers: {
    async jira_search_issues(args, creds) {
      return searchIssues(String(args.jql || "").trim() || "ORDER BY updated DESC", creds);
    },
    async jira_my_issues(_args, creds) {
      return searchIssues("assignee = currentUser() ORDER BY updated DESC", creds);
    },
    async jira_get_issue(args, creds) {
      const site = String((creds && creds.site) || "")
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");
      const key = String(args.key || "").trim();
      const data = (await jira(
        "/rest/api/3/issue/" + encodeURIComponent(key) + "?fields=summary,status,assignee",
        creds,
      )) as Record<string, unknown>;
      return { issue: issue(data, site) };
    },
    async jira_list_projects(_args, creds) {
      const data = (await jira("/rest/api/3/project/search", creds)) as {
        values?: { key?: string; name?: string; id?: string }[];
      };
      return {
        projects: (data.values || []).map((p) => ({ key: p.key, name: p.name, id: p.id })),
      };
    },
    async jira_add_comment(args, creds) {
      const key = String(args.key || "").trim();
      const body = String(args.body || "");
      const data = (await jira("/rest/api/3/issue/" + encodeURIComponent(key) + "/comment", creds, {
        method: "POST",
        body: JSON.stringify({ body: adf(body) }),
        headers: { "Content-Type": "application/json" },
      })) as { id?: string };
      return { ok: true, id: data?.id };
    },
    async jira_create_issue(args, creds) {
      const site = String((creds && creds.site) || "")
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");
      const projectKey = String(args.projectKey || "").trim();
      const summary = String(args.summary || "");
      const issueType = String(args.issueType || "").trim() || "Task";
      const fields: Record<string, unknown> = {
        project: { key: projectKey },
        summary,
        issuetype: { name: issueType },
      };
      if (args.description) fields.description = adf(String(args.description));
      const data = (await jira("/rest/api/3/issue", creds, {
        method: "POST",
        body: JSON.stringify({ fields }),
        headers: { "Content-Type": "application/json" },
      })) as { key?: string };
      return { key: data.key, url: "https://" + site + "/browse/" + data.key };
    },
  },
  async test(creds) {
    const me = (await jira("/rest/api/3/myself", creds)) as {
      displayName?: string;
      emailAddress?: string;
      accountId?: string;
    };
    return { ok: true, info: "Đã kết nối Jira: " + (me.displayName || me.emailAddress || me.accountId) };
  },
};

export default jiraConnector;
