// GitHub connector — auth with a Personal Access Token (PAT).
// Public data (a given owner's public repos/issues) works even without a token;
// the token unlocks your own/private repos and higher rate limits.
const API = 'https://api.github.com';

async function gh(pathname, creds) {
  const headers = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'LAAM-connector/0.1' };
  if (creds && creds.token) headers['Authorization'] = 'Bearer ' + creds.token;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(API + pathname, { headers, signal: ctrl.signal });
    const body = await r.json().catch(() => null);
    if (!r.ok) throw new Error((body && body.message) || ('HTTP ' + r.status));
    return body;
  } finally { clearTimeout(timer); }
}

const repo = (r) => ({ name: r.full_name, private: r.private, stars: r.stargazers_count, lang: r.language, updated: r.updated_at, url: r.html_url, desc: r.description });
const issue = (i) => ({ number: i.number, title: i.title, state: i.state, repo: (i.repository_url || '').replace(API + '/repos/', ''), labels: (i.labels || []).map((l) => l.name), url: i.html_url, updated: i.updated_at });

export default {
  id: 'github',
  name: 'GitHub',
  icon: 'git-branch',
  blurb: 'Repos, issues, pull requests',
  auth: {
    type: 'token',
    help: 'Tạo Personal Access Token tại github.com/settings/tokens (scope: repo). Dán vào đây — LAAM lưu phía máy chủ, không gửi đi đâu khác.',
    fields: [{ key: 'token', label: 'Personal Access Token', placeholder: 'ghp_…', secret: true }],
  },
  tools: [
    { type: 'function', function: { name: 'github_list_repos', description: 'Liệt kê các repository trên GitHub. Bỏ trống "owner" để lấy repo của chính người dùng (cần token); hoặc nêu "owner" để lấy repo công khai của một tài khoản.', parameters: { type: 'object', properties: { owner: { type: 'string', description: 'tên user/org (tuỳ chọn)' }, limit: { type: 'number', description: 'số lượng tối đa, mặc định 10' } } } } },
    { type: 'function', function: { name: 'github_list_issues', description: 'Liệt kê issue của một repository GitHub.', parameters: { type: 'object', properties: { owner: { type: 'string' }, repo: { type: 'string' }, state: { type: 'string', description: 'open | closed | all' } }, required: ['owner', 'repo'] } } },
    { type: 'function', function: { name: 'github_search_issues', description: 'Tìm issue/PR trên GitHub theo cú pháp tìm kiếm của GitHub.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
  ],
  handlers: {
    async github_list_repos(args, creds) {
      const limit = Math.min(Number(args.limit) || 10, 30);
      const p = args.owner ? `/users/${encodeURIComponent(args.owner)}/repos?per_page=${limit}&sort=updated` : `/user/repos?per_page=${limit}&sort=updated`;
      const data = await gh(p, creds);
      return { repos: (Array.isArray(data) ? data : []).slice(0, limit).map(repo) };
    },
    async github_list_issues(args, creds) {
      const state = ['open', 'closed', 'all'].includes(args.state) ? args.state : 'open';
      const data = await gh(`/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}/issues?state=${state}&per_page=15`, creds);
      return { issues: (Array.isArray(data) ? data : []).filter((i) => !i.pull_request).map(issue) };
    },
    async github_search_issues(args, creds) {
      const data = await gh('/search/issues?per_page=15&q=' + encodeURIComponent(args.query || ''), creds);
      return { total: data.total_count, issues: (data.items || []).map(issue) };
    },
  },
  async test(creds) {
    const me = await gh('/user', creds);
    return { ok: true, info: 'Đã kết nối GitHub: @' + me.login };
  },
};
