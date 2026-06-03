export const meta = {
  name: 'connectors',
  description: 'Build additional LAAM connector modules (Trello, Jira, Google) as pluggable files',
  phases: [{ title: 'Build', detail: 'one agent per connector, disjoint files' }],
};

const ICONS = 'clipboard-list list layers folder clock message-square git-branch database file-text users building-2 globe bot wrench network share-2 search filter calendar mail'.split(' ');

const SPEC = `
You are adding a CONNECTOR module to LAAM's connector framework. Read
lib/connectors/index.js (the contract, top comment) and lib/connectors/github.js
(a complete REAL example) FIRST.

A connector is ONE file in lib/connectors/ exporting a default object:
  export default {
    id: 'trello',                 // unique, lowercase
    name: 'Trello',
    icon: '<lucide-name>',        // MUST be one of: clipboard-list list layers folder clock
                                  //   message-square git-branch database file-text users globe bot wrench
    blurb: 'short description',
    auth: {
      type: 'token',              // user pastes API key/token(s)
      help: 'plain instructions (Vietnamese) on where to get the token',
      fields: [{ key, label, placeholder, secret:true }],   // one per credential value
    },
    tools: [ { type:'function', function:{ name, description, parameters:{type:'object',properties,required} } } ],
    handlers: { '<tool name>': async (args, creds) => <json-serialisable result> },
    test: async (creds) => ({ ok:true, info:'…' }),   // verify the creds work (one cheap API call)
  }
The framework auto-loads any *.js file here; do NOT edit index.js or any other file.

## HARD RULES
1. Create ONLY your one connector file (or, for Google, the listed files). Touch nothing else.
2. Handlers make REAL HTTP calls (global fetch) to the service's REST API using the
   user's creds. Add a 12s AbortController timeout. On HTTP error throw new Error with the
   API's message. Return compact JSON (arrays of small objects: id/title/status/url/date…),
   capped to ~15 items — this goes back to a local model, keep it small.
3. Tool names MUST be namespaced (e.g. trello_list_cards, jira_search_issues). Descriptions
   in Vietnamese so the model picks them for Vietnamese prompts.
4. NEVER hard-code any secret/token. Credentials come only from \`creds\` (the user enters them).
5. icon MUST be from the allowed list above (others render blank).
6. Keep it dependency-free (Node 20 global fetch). ESM \`export default\`. Must pass \`node --check\`.

Return a short report: file(s) created, the connector's tools, the auth fields, the exact API
endpoints used, and how the user gets the token.
`;

const JOBS = [
  { label: 'trello', file: 'lib/connectors/trello.js', notes: 'Trello REST API (https://api.trello.com/1). Auth = API key + token (two fields, both secret). Get them at trello.com/app-key (key) + generate a token. Tools: trello_list_boards (GET /members/me/boards?key=&token=), trello_list_cards (GET /boards/{id}/cards or /members/me/cards), trello_create_card (POST /cards?idList=&name=&desc=). test = GET /members/me. icon: clipboard-list.' },
  { label: 'jira', file: 'lib/connectors/jira.js', notes: 'Jira Cloud REST API. Auth fields: site (e.g. yourcompany.atlassian.net), email, api_token (secret) — get token at id.atlassian.com/manage-profile/security/api-tokens. Use HTTP Basic auth: header Authorization: "Basic "+base64(email+":"+token) (use Buffer.from(...).toString("base64")). Tools: jira_search_issues (GET https://{site}/rest/api/3/search?jql=&maxResults=15), jira_my_issues (jql=assignee=currentUser() ORDER BY updated). Return key/summary/status/assignee/url. test = GET /rest/api/3/myself. icon: list.' },
  { label: 'google', file: 'lib/connectors/google-drive.js + lib/connectors/google-calendar.js + lib/connectors/gmail.js', notes: [
      'THREE files, one per Google service. Google needs OAuth. Pragmatic scaffold: auth.type token with ONE field key access_token (secret) — the user pastes a Google OAuth2 access token (instruct: get one from the OAuth 2.0 Playground at developers.google.com/oauthplayground with the right scope; a future in-app OAuth flow is coming). Handlers call the REST APIs with header Authorization Bearer plus creds.access_token, 12s timeout, fail-soft.',
      'google-drive.js (icon folder): tools gdrive_list_files (GET https://www.googleapis.com/drive/v3/files with pageSize=15 and fields for id,name,mimeType,modifiedTime,webViewLink), gdrive_search (q parameter, name contains the query). test = GET /drive/v3/about?fields=user.',
      'google-calendar.js (icon clock): tool gcal_list_events (GET https://www.googleapis.com/calendar/v3/calendars/primary/events with maxResults=15, timeMin = now ISO, singleEvents=true, orderBy=startTime). test = GET /calendar/v3/calendars/primary.',
      'gmail.js (icon message-square): tools gmail_list_messages (GET https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10 then GET each id for subject/from/snippet — keep small), gmail_search (q parameter). test = GET /gmail/v1/users/me/profile.',
      'In each auth.help, state clearly this needs a Google OAuth access token and a full in-app OAuth flow is coming; do NOT attempt to log in for the user.',
    ].join(' ') },
];

phase('Build');
const reports = await parallel(JOBS.map((j) => () =>
  agent(SPEC + `\n\n=== YOUR CONNECTOR: ${j.label} ===\nCreate: ${j.file}\nDETAILS: ${j.notes}\n\nWrite the file(s) now following the contract and the github.js example, then report.`,
    { label: 'connector:' + j.label, phase: 'Build' })
));
return JOBS.map((j, i) => ({ connector: j.label, report: reports[i] }));
