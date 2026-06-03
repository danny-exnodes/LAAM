import { expect, test } from 'vitest';
import type { Lang, Dict } from './types';

test('Dict entry has all three langs; Lang is the union', () => {
  const d: Dict = { greet: { vi: 'Chào', en: 'Hi', zh: '你好' } };
  const l: Lang = 'vi';
  expect(d.greet[l]).toBe('Chào');
  expect(d.greet.en).toBe('Hi');
  expect(d.greet.zh).toBe('你好');
});
