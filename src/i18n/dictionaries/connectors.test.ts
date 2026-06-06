import { expect, test } from 'vitest';
import { connectors } from './connectors';
import { resolve } from '../index';

test('connectors has every key (17 v1 + 10 OAuth + 14 per-connector = 41) across 3 langs', () => {
  const keys = Object.keys(connectors);
  expect(keys.length).toBe(41);
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
