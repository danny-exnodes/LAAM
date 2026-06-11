import { expect, test } from 'vitest';
import { agents } from './agents';
import { resolve } from '../index';

test('agents+session ports every v1 leaf key (+2 v2 token keys +1 group label +1 machine filter) across 3 langs', () => {
  const keys = Object.keys(agents);
  expect(keys.length).toBe(72);
  for (const k of keys) {
    expect(typeof agents[k].vi).toBe('string');
    expect(typeof agents[k].en).toBe('string');
    expect(typeof agents[k].zh).toBe('string');
  }
});

test('sample agents/session strings resolve incl. vars', () => {
  expect(resolve(agents, 'en', 'agents.srcAll')).toBe('All sources');
  expect(resolve(agents, 'vi', 'agents.count', { shown: 3, total: 9 })).toBe('3/9 session');
  expect(resolve(agents, 'zh', 'session.back')).toBe('← 智能体');
  expect(resolve(agents, 'en', 'agents.subs', { n: 2 })).toBe('Sub-agents (2)');
});
