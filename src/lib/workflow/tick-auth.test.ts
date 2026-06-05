import { describe, expect, test } from "vitest";
import { isTickAuthorized } from "./tick-auth";

// Helper dựng Headers từ object.
const H = (o: Record<string, string>) => new Headers(o);

describe("isTickAuthorized — tick endpoint auth (localhost OR secret, KHÔNG session)", () => {
  test("secret khớp → authorized (kể cả host không phải localhost)", () => {
    expect(isTickAuthorized(H({ host: "laam.example.com", "x-workflow-tick-secret": "S3CRET" }), { WORKFLOW_TICK_SECRET: "S3CRET" })).toBe(true);
  });

  test("secret SAI → không authorized (host remote)", () => {
    expect(isTickAuthorized(H({ host: "laam.example.com", "x-workflow-tick-secret": "wrong" }), { WORKFLOW_TICK_SECRET: "S3CRET" })).toBe(false);
  });

  test("localhost host (không proxy) → authorized dù không có secret", () => {
    expect(isTickAuthorized(H({ host: "localhost:3100" }), {})).toBe(true);
    expect(isTickAuthorized(H({ host: "127.0.0.1:3100" }), {})).toBe(true);
    expect(isTickAuthorized(H({ host: "[::1]:3100" }), {})).toBe(true);
  });

  test("host remote + KHÔNG secret config + KHÔNG header → KHÔNG authorized", () => {
    expect(isTickAuthorized(H({ host: "laam.example.com" }), {})).toBe(false);
  });

  test("localhost NHƯNG có x-forwarded-for (qua proxy) → KHÔNG tin localhost", () => {
    // Host có thể bị giả khi qua proxy → nếu có forwarding header, không cho qua bằng localhost.
    expect(isTickAuthorized(H({ host: "localhost:3100", "x-forwarded-for": "203.0.113.9" }), {})).toBe(false);
  });

  test("localhost + có forwarded NHƯNG secret khớp → vẫn authorized (secret thắng)", () => {
    expect(isTickAuthorized(H({ host: "localhost", "x-forwarded-for": "203.0.113.9", "x-workflow-tick-secret": "S3CRET" }), { WORKFLOW_TICK_SECRET: "S3CRET" })).toBe(true);
  });

  test("secret config rỗng/không set → KHÔNG bao giờ pass bằng header rỗng", () => {
    // env không set secret + client gửi header rỗng → không được khớp '' === ''.
    expect(isTickAuthorized(H({ host: "remote.example", "x-workflow-tick-secret": "" }), {})).toBe(false);
    expect(isTickAuthorized(H({ host: "remote.example", "x-workflow-tick-secret": "" }), { WORKFLOW_TICK_SECRET: "" })).toBe(false);
  });
});
