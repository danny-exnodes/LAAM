import { describe, expect, test } from "vitest";
import { encodeFrame, SEP, type ChatFrame } from "./frames";

describe("encodeFrame", () => {
  test("bọc JSON-1-dòng trong cặp U+001E (envelope SP-4 §2.2)", () => {
    const f: ChatFrame = {
      t: "pending_write",
      token: "tok",
      tool: "trello_create_card",
      title: "Tạo card Trello",
      summary: "x",
    };
    const enc = encodeFrame(f);
    expect(enc.startsWith(SEP)).toBe(true);
    expect(enc.endsWith(SEP)).toBe(true);
    expect(JSON.parse(enc.slice(1, -1))).toEqual(f);
  });
  test("tokens frame round-trips", () => {
    expect(encodeFrame({ t: "tokens", i: 3, o: 5 })).toBe(SEP + '{"t":"tokens","i":3,"o":5}' + SEP);
  });
});
