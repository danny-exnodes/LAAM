import { describe, it, expect } from "vitest";
import { toMarkdown } from "./markdown";

describe("toMarkdown", () => {
  it("emits a Vietnamese role header per message", () => {
    const md = toMarkdown([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ]);
    expect(md).toContain("**Bạn:**");
    expect(md).toContain("**Trợ lý:**");
  });

  it("includes each message's content", () => {
    const md = toMarkdown([{ role: "user", content: "the answer is 42" }]);
    expect(md).toContain("the answer is 42");
  });

  it("separates sections with a horizontal rule", () => {
    const md = toMarkdown([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ]);
    expect(md).toContain("\n\n---\n\n");
  });

  it("preserves code fences in content verbatim", () => {
    const fence = "```js\nconst x = 1;\n```";
    const md = toMarkdown([{ role: "assistant", content: fence }]);
    expect(md).toContain(fence);
  });

  it("falls back to the raw role for unknown roles", () => {
    const md = toMarkdown([{ role: "system", content: "boot" }]);
    expect(md).toContain("**system:**");
  });

  it("returns an empty string for an empty conversation", () => {
    expect(toMarkdown([])).toBe("");
  });
});
