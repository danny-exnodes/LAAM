import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MarkdownView } from "./MarkdownView";

describe("MarkdownView", () => {
  it("renders a GFM table as a <table>", () => {
    const md = ["| A | B |", "| - | - |", "| 1 | 2 |"].join("\n");
    const { container } = render(<MarkdownView source={md} />);
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelectorAll("td").length).toBe(2);
  });

  it("renders **bold** as <strong>", () => {
    const { container } = render(<MarkdownView source="**hi**" />);
    const strong = container.querySelector("strong");
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toBe("hi");
  });

  it("strips a <script> tag (XSS)", () => {
    const { container } = render(
      <MarkdownView source={'before <script>window.__xss=1<\/script> after'} />,
    );
    expect(container.querySelector("script")).toBeNull();
    // the sanitizer should not leave a live script in the DOM
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it("renders a ```chart fence as a chart block", () => {
    const md = [
      "```chart",
      '{"type":"bar","data":{"labels":["a"],"datasets":[{"label":"x","data":[1]}]}}',
      "```",
    ].join("\n");
    const { container } = render(<MarkdownView source={md} />);
    expect(container.querySelector(".chat-chart")).not.toBeNull();
  });

  it("renders a ```map fence as a map block", () => {
    const md = ["```map", '{"markers":[{"lat":21,"lng":105,"label":"x"}]}', "```"].join("\n");
    const { container } = render(<MarkdownView source={md} />);
    expect(container.querySelector(".chat-map-wrap")).not.toBeNull();
  });

  it("renders a plain code fence via the code block (copy button present)", () => {
    const md = ["```js", "const x = 1;", "```"].join("\n");
    const { getByRole } = render(<MarkdownView source={md} />);
    expect(getByRole("button", { name: /copy|sao chép/i })).not.toBeNull();
  });

  it("applies a className to the wrapper", () => {
    const { container } = render(<MarkdownView source="hi" className="bubble" />);
    expect(container.querySelector(".bubble")).not.toBeNull();
  });
});
