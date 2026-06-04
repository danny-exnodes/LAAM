import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { CodeBlock } from "./CodeBlock";

describe("CodeBlock", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("renders the code text", () => {
    const { container } = render(<CodeBlock code="const x = 1;" language="js" />);
    expect(container.textContent).toContain("const x = 1;");
  });

  it("renders a copy button", () => {
    const { getByRole } = render(<CodeBlock code="hi" language="js" />);
    expect(getByRole("button", { name: /copy|sao chép/i })).not.toBeNull();
  });

  it("copies the code to the clipboard when the button is clicked", () => {
    const { getByRole } = render(<CodeBlock code="echo hi" language="bash" />);
    fireEvent.click(getByRole("button", { name: /copy|sao chép/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("echo hi");
  });

  it("renders without throwing when no language is given", () => {
    expect(() => render(<CodeBlock code="plain" />)).not.toThrow();
  });
});
