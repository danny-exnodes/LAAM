import { describe, expect, test } from "vitest";
import { parseArgs, digitsOf, contains } from "./util";

describe("parseArgs", () => {
  test("object giữ nguyên", () => expect(parseArgs({ id: "x" })).toEqual({ id: "x" }));
  test("JSON string → object (model hay gửi chuỗi)", () =>
    expect(parseArgs('{"id":"x"}')).toEqual({ id: "x" }));
  test("string hỏng / null → {}", () => {
    expect(parseArgs("not json")).toEqual({});
    expect(parseArgs(null)).toEqual({});
  });
});

describe("digitsOf", () => {
  test("bỏ dấu phân tách số", () => expect(digitsOf("12,345")).toBe("12345"));
});

describe("contains", () => {
  test("khớp text không phân biệt hoa thường", () =>
    expect(contains("Agent billing-SVC kẹt", "billing-svc")).toBe(true));
  test("khớp số dù model định dạng lại", () =>
    expect(contains("đã dùng 12.345 token", "12345")).toBe(true));
  test("không khớp khi vắng mặt", () =>
    expect(contains("không có gì", "billing-svc")).toBe(false));
});
