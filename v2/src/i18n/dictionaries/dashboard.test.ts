import { expect, test } from 'vitest';
import { dashboard } from './dashboard';
import { resolve } from '../index';

test('dashboard ports every v1 leaf key (106) across 3 langs', () => {
  const keys = Object.keys(dashboard);
  expect(keys.length).toBe(106);
  for (const k of keys) {
    expect(typeof dashboard[k].vi).toBe('string');
    expect(typeof dashboard[k].en).toBe('string');
    expect(typeof dashboard[k].zh).toBe('string');
  }
});

test('sample dashboard strings resolve, including nested + vars', () => {
  expect(resolve(dashboard, 'en', 'dash.kpi.sessions')).toBe('Sessions');
  expect(resolve(dashboard, 'vi', 'dash.kpi.sub.projects', { n: 4 })).toBe('4 project');
  expect(resolve(dashboard, 'zh', 'dash.hm.day.mon')).toBe('一');
  expect(resolve(dashboard, 'en', 'dash.mdl.th.doneRate')).toBe('Done %');
});
