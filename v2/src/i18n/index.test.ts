import { expect, test } from 'vitest';
import { resolve } from './index';
import type { Dict } from './types';

const d: Dict = {
  'nav.dashboard': { vi: 'Tổng quan', en: 'Dashboard', zh: '仪表盘' },
  'kpi.sub.projects': { vi: '{n} project', en: '{n} projects', zh: '{n} 个项目' },
  'onlyVi': { vi: 'Chỉ VI', en: '', zh: '' },
};

test('returns the active-lang string', () => {
  expect(resolve(d, 'en', 'nav.dashboard')).toBe('Dashboard');
  expect(resolve(d, 'zh', 'nav.dashboard')).toBe('仪表盘');
});

test('interpolates {var} from vars (number + string)', () => {
  expect(resolve(d, 'en', 'kpi.sub.projects', { n: 3 })).toBe('3 projects');
  expect(resolve(d, 'vi', 'kpi.sub.projects', { n: '12' })).toBe('12 project');
});

test('leaves unknown {var} placeholders intact', () => {
  expect(resolve(d, 'en', 'kpi.sub.projects')).toBe('{n} projects');
});

test('falls back to vi when the active-lang string is empty', () => {
  expect(resolve(d, 'en', 'onlyVi')).toBe('Chỉ VI');
});

test('falls back to the key itself when missing entirely', () => {
  expect(resolve(d, 'en', 'does.not.exist')).toBe('does.not.exist');
});
