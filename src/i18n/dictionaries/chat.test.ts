import { expect, test } from 'vitest';
import { chat } from './chat';
import { resolve } from '../index';

test('chat dict ports every v1 leaf key (>=157) across 3 langs', () => {
  const keys = Object.keys(chat);
  // 157 = v1 ported baseline; Wave 3 added a couple of error strings. Guard
  // against dropping v1 keys (never below baseline); all keys carry 3 langs.
  expect(keys.length).toBeGreaterThanOrEqual(157);
  for (const k of keys) {
    expect(typeof chat[k].vi).toBe('string');
    expect(typeof chat[k].en).toBe('string');
    expect(typeof chat[k].zh).toBe('string');
  }
});

test('sample chat strings resolve incl. vars', () => {
  expect(resolve(chat, 'en', 'chat.send')).toBe('Send');
  expect(resolve(chat, 'vi', 'chat.attachChars', { name: 'a.txt', n: 12 })).toBe('a.txt · 12 ký tự');
  expect(resolve(chat, 'zh', 'chat.histNew')).toBe('新建');
  expect(resolve(chat, 'en', 'chat.modelLocalFree', { model: 'gemma' })).toBe('gemma (local) · free');
});
