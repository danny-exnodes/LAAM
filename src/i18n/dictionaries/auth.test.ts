import { expect, test } from 'vitest';
import { authDict } from './auth';
import { resolve } from '../index';

// Login/register are the app's entry points — a missing translation there is the
// first thing a non-vi user sees, so every key MUST ship all three languages.
test('auth has the expected key count (28) and a non-empty vi/en/zh for every key', () => {
  const keys = Object.keys(authDict);
  expect(keys.length).toBe(28);
  for (const k of keys) {
    expect(authDict[k].vi, `${k}.vi`).toBeTruthy();
    expect(authDict[k].en, `${k}.en`).toBeTruthy();
    expect(authDict[k].zh, `${k}.zh`).toBeTruthy();
  }
});

test('sample auth strings resolve per language', () => {
  expect(resolve(authDict, 'vi', 'auth.login.err')).toBe('Email hoặc mật khẩu không đúng.');
  expect(resolve(authDict, 'en', 'auth.login.err')).toBe('Incorrect email or password.');
  expect(resolve(authDict, 'zh', 'auth.login.title')).toBe('登录');
  expect(resolve(authDict, 'en', 'auth.register.passwordMin')).toBe('Password (≥ 8 characters)');
});

// "owner" is the RBAC role stored in the DB — translating it would teach users a
// role name that the permission UI never uses. It must stay verbatim everywhere.
test('register subtitle keeps the literal role name "owner" in all langs', () => {
  for (const lang of ['vi', 'en', 'zh'] as const) {
    expect(resolve(authDict, lang, 'auth.register.sub')).toContain('owner');
  }
});
