// Jira Cloud connector — auth with email + API token over HTTP Basic.
// Create an API token at id.atlassian.com/manage-profile/security/api-tokens.
import type { Connector } from "./types";

async function jira(pathname: string, creds: Record<string, string>): Promise<unknown> {
  const site = String((creds && creds.site) || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  if (!site) throw new Error("thiếu site (vd: yourcompany.atlassian.net)");
  const basic = Buffer.from(((creds && creds.email) || "") + ":" + ((creds && creds.api_token) || "")).toString("base64");
  const headers = { Accept: "application/json", Authorization: "Basic " + basic, "User-Agent": "LAAM-connector/0.1" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch("https://" + site + pathname, { headers, signal: ctrl.signal });
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
  ],
  handlers: {
    async jira_search_issues(args, creds) {
      return searchIssues(String(args.jql || "").trim() || "ORDER BY updated DESC", creds);
    },
    async jira_my_issues(_args, creds) {
      return searchIssues("assignee = currentUser() ORDER BY updated DESC", creds);
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
