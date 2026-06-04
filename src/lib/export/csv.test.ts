import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("emits the columns array as the header row", () => {
    const csv = toCsv([], ["id", "name"]);
    expect(csv).toBe('"id","name"');
  });

  it("orders cells by the columns array, not by row key order", () => {
    const csv = toCsv([{ name: "a", id: "1" }], ["id", "name"]);
    expect(csv.split("\r\n")[1]).toBe('"1","a"');
  });

  it("keeps a value containing a comma inside its quoted cell", () => {
    const csv = toCsv([{ v: "a,b" }], ["v"]);
    expect(csv.split("\r\n")[1]).toBe('"a,b"');
  });

  it("doubles embedded double-quotes", () => {
    const csv = toCsv([{ v: 'say "hi"' }], ["v"]);
    expect(csv.split("\r\n")[1]).toBe('"say ""hi"""');
  });

  it("keeps embedded newlines inside the quoted cell (row join is \\r\\n)", () => {
    const csv = toCsv([{ v: "line1\nline2" }], ["v"]);
    // header + one data cell containing the newline, then no extra row
    expect(csv).toBe('"v"\r\n"line1\nline2"');
  });

  it("renders null/undefined/missing keys as an empty quoted cell", () => {
    const csv = toCsv([{ a: null, b: undefined }], ["a", "b", "c"]);
    expect(csv.split("\r\n")[1]).toBe('"","",""');
  });

  it("returns only the header line for empty rows", () => {
    expect(toCsv([], ["x"])).toBe('"x"');
  });

  it("joins multiple rows with CRLF", () => {
    const csv = toCsv([{ v: "1" }, { v: "2" }], ["v"]);
    expect(csv).toBe('"v"\r\n"1"\r\n"2"');
  });

  it("stringifies numbers and booleans", () => {
    const csv = toCsv([{ n: 42, b: true }], ["n", "b"]);
    expect(csv.split("\r\n")[1]).toBe('"42","true"');
  });
});
