import { expect, test } from 'vitest';
import { connectors } from './connectors';
import { resolve } from '../index';
import { CONNECTORS } from '@/lib/connectors/registry';

test('connectors has every key (17 v1 + 13 OAuth/authorize + 23 per-connector + 24 MCP = 77) across 3 langs', () => {
  // 2026-06-12 multi-provider OAuth expansion: +3 flow keys (connectWith /
  // manualOption / trelloFinishing), −1 dead key (connectGoogle → connectWith),
  // +9 svc keys (jira.setup, slack ×3, whatsapp ×2, zalo ×3); review-fix 06-12 +1 (errForbidden).
  const keys = Object.keys(connectors);
  expect(keys.length).toBe(77);
  for (const k of keys) {
    expect(typeof connectors[k].vi).toBe('string');
    expect(typeof connectors[k].en).toBe('string');
    expect(typeof connectors[k].zh).toBe('string');
  }
});

test('sample connector strings resolve', () => {
  expect(resolve(connectors, 'en', 'conn.connect')).toBe('Connect');
  expect(resolve(connectors, 'vi', 'conn.testOk')).toBe('Kết nối OK');
  expect(resolve(connectors, 'zh', 'conn.oauthNeeded')).toBe('需要 OAuth — 即将推出');
});

test('dict vi KHÔNG trôi khỏi chuỗi connector cung cấp (dict override → trôi = user thấy text cũ)', () => {
  // The dict's conn.svc.<id>.* vi values are documented as the EXACT strings from
  // src/lib/connectors/<id>.ts. Because svc() prefers the dict, any drift means
  // users silently see STALE help/setup (e.g. the dead trello.com/app-key page).
  // Scope: the connectors touched by the 2026-06-12 expansion.
  const byId = Object.fromEntries(CONNECTORS.map((c) => [c.id, c]));
  const cases: [string, string | undefined][] = [
    ['conn.svc.trello.help', byId.trello?.auth.help],
    ['conn.svc.jira.setup', byId.jira?.auth.setup],
    ['conn.svc.slack.blurb', byId.slack?.blurb],
    ['conn.svc.slack.help', byId.slack?.auth.help],
    ['conn.svc.slack.setup', byId.slack?.auth.setup],
    ['conn.svc.whatsapp.blurb', byId.whatsapp?.blurb],
    ['conn.svc.whatsapp.help', byId.whatsapp?.auth.help],
    ['conn.svc.zalo.blurb', byId.zalo?.blurb],
    ['conn.svc.zalo.help', byId.zalo?.auth.help],
    ['conn.svc.zalo.setup', byId.zalo?.auth.setup],
  ];
  for (const [key, fromConnector] of cases) {
    expect(fromConnector, `${key}: connector string missing`).toBeTruthy();
    expect(connectors[key]?.vi, `${key}: dict vi ≠ connector vi (drift)`).toBe(fromConnector);
  }
});
