import { expect, test } from 'vitest';
import { common } from './common';
import { resolve } from '../index';

test('common has the expected key count (46) and all 3 langs each', () => {
  // 34 v1 keys + 10 header-action keys (U3: theme/sync/account i18n)
  // + 2 R0-hardening keys (nav.label aria, graph.empty server-rendered state).
  const keys = Object.keys(common);
  expect(keys.length).toBe(46);
  for (const k of keys) {
    expect(typeof common[k].vi).toBe('string');
    expect(typeof common[k].en).toBe('string');
    expect(typeof common[k].zh).toBe('string');
  }
});

test('sample shared strings resolve correctly', () => {
  expect(resolve(common, 'en', 'nav.dashboard')).toBe('Dashboard');
  expect(resolve(common, 'vi', 'nav.dashboard')).toBe('Tổng quan');
  expect(resolve(common, 'zh', 'nav.dashboard')).toBe('仪表盘');
  expect(resolve(common, 'en', 'common.copied')).toBe('Copied');
  expect(resolve(common, 'vi', 'time.minAgo', { n: 5 })).toBe('5 phút trước');
  expect(resolve(common, 'en', 'status.stuck')).toBe('Stuck');
});
