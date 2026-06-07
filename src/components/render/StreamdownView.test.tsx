import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { StreamdownView } from "./StreamdownView";

// SPIKE adjudication (2026-06-07): the binary risk is whether our components.code
// override intercepts ```chart / ```map BEFORE Streamdown's Shiki code plugin
// grabs the fence. These two tests ARE acceptance criterion #1 — if they go red,
// the spike fails on (1) and we fall back to react-markdown (the default path,
// still shipped). Other cases mirror MarkdownView.test.tsx so we know the
// Streamdown path keeps table/XSS/code parity.

describe("StreamdownView", () => {
  it("routes a ```chart fence to ChartBlock (criterion 1a — not swallowed by Shiki)", () => {
    const md = [
      "```chart",
      '{"type":"bar","data":{"labels":["a"],"datasets":[{"label":"x","data":[1]}]}}',
      "```",
    ].join("\n");
    const { container } = render(<StreamdownView source={md} />);
    expect(container.querySelector(".chat-chart")).not.toBeNull();
  });

  it("routes a ```map fence to MapBlock (criterion 1b — not swallowed by Shiki)", () => {
    const md = ["```map", '{"markers":[{"lat":21,"lng":105,"label":"x"}]}', "```"].join("\n");
    const { container } = render(<StreamdownView source={md} />);
    expect(container.querySelector(".chat-map-wrap")).not.toBeNull();
  });

  it("renders a plain code fence (criterion 2 — Shiki owns normal code)", () => {
    const md = ["```js", "const x = 1;", "```"].join("\n");
    const { container } = render(<StreamdownView source={md} />);
    // The exact code text survives rendering regardless of highlight tokenization.
    expect(container.textContent).toContain("const x = 1;");
  });

  it("renders a GFM table as a <table>", () => {
    const md = ["| A | B |", "| - | - |", "| 1 | 2 |"].join("\n");
    const { container } = render(<StreamdownView source={md} />);
    expect(container.querySelector("table")).not.toBeNull();
  });

  it("strips a <script> tag (XSS — rehype-harden)", () => {
    const { container } = render(
      <StreamdownView source={'before <script>window.__sd_xss=1<\/script> after'} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect((window as unknown as { __sd_xss?: number }).__sd_xss).toBeUndefined();
  });
});
