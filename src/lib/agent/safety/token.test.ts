import { describe, expect, test } from "vitest";
import { sealPendingWrite, openPendingWrite, type PendingWrite } from "./token";

const base: PendingWrite = {
  v: 1,
  name: "trello_create_card",
  args: { idList: "l1", name: "Mua sữa" },
  conversationId: "c1",
  userId: "u1",
  iat: 1000,
  exp: 1000 + 5 * 60_000,
  nonce: "n1",
};

describe("token seal/open", () => {
  test("round-trip giữ nguyên payload", () => {
    const r = openPendingWrite(sealPendingWrite(base), 2000);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe("trello_create_card");
      expect(r.value.args).toEqual({ idList: "l1", name: "Mua sữa" });
      expect(r.value.userId).toBe("u1");
      expect(r.value.nonce).toBe("n1");
    }
  });
  test("token mờ — không lộ args/tool dạng plaintext", () => {
    const tok = sealPendingWrite(base);
    expect(tok).not.toContain("Mua sữa");
    expect(tok).not.toContain("trello_create_card");
  });
  test("sửa token (hỏng iv) → reject", () => {
    const tok = sealPendingWrite(base);
    const tampered = (tok[0] === "A" ? "B" : "A") + tok.slice(1);
    expect(openPendingWrite(tampered, 2000).ok).toBe(false);
  });
  test("hết hạn → reject", () => {
    expect(openPendingWrite(sealPendingWrite(base), base.exp + 1).ok).toBe(false);
  });
});
