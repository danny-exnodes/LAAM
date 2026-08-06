import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { ConversationLog } from "./ConversationLog";
import type { Turn } from "./turns";

const turns: Turn[] = [
  { role: "user", text: "top 5 employee có tổng hoàn tiền cao nhất" },
  { role: "assistant", text: "Đứng đầu là Sarah Miller với 3.689 đô." },
];


const renderLog = (ui: React.ReactElement) => render(<I18nProvider lang="vi">{ui}</I18nProvider>);

const props = {
  title: "Hội thoại",
  youLabel: "Bạn",
};

describe("ConversationLog", () => {
  it("is a region, NOT a dialog — the user keeps talking while it is open, so it must not be modal", () => {
    renderLog(<ConversationLog turns={turns} open {...props} />);
    expect(screen.getByRole("region")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders every turn in order — a transcript that drops a turn is worse than none", () => {
    renderLog(<ConversationLog turns={turns} open {...props} />);
    expect(screen.getByText(/top 5 employee/)).toBeTruthy();
    expect(screen.getByText(/Sarah Miller/)).toBeTruthy();
  });

  it("labels who said what — the trust boundary between the user's words and Larvis's", () => {
    renderLog(<ConversationLog turns={turns} open {...props} />);
    expect(screen.getByText("Bạn")).toBeTruthy();
    expect(screen.getByText("Larvis")).toBeTruthy();
  });

  // Parity with /chat: an assistant reply is rendered through ChatMarkdown, so a GFM
  // table becomes a real table instead of raw pipe syntax. Storing the stripped speech
  // prose instead would make the transcript the only surface that loses the structure.
  it("assistant markdown renders like /chat — a GFM table becomes a <table>, not pipe text", () => {
    const md = ["| Store | Variance |", "|---|---|", "| PH-005 | 1015 |"].join("\n");
    renderLog(
      <ConversationLog turns={[{ role: "assistant", text: md }]} open {...props} />,
    );
    expect(document.querySelector("table")).toBeTruthy();
    expect(screen.getByText("PH-005")).toBeTruthy();
    expect(screen.queryByText(/\|/)).toBeNull(); // no raw pipe syntax leaked through
  });

  it("user turn stays plain text — a stray asterisk must not reflow what the user said", () => {
    renderLog(
      <ConversationLog turns={[{ role: "user", text: "giá *chưa* gồm VAT" }]} open {...props} />,
    );
    expect(screen.getByText(/giá \*chưa\* gồm VAT/)).toBeTruthy();
    expect(document.querySelector("em")).toBeNull();
  });

  // Chromeless: no frame, no header, no close button — visibility is owned by the command
  // input's toggle, so the log renders nothing at all rather than an empty floating box.
  it("no turns → renders nothing (no empty frame floating over the starfield)", () => {
    const { container } = renderLog(<ConversationLog turns={[]} open {...props} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("has no chrome of its own — no close button, no visible header text", () => {
    renderLog(<ConversationLog turns={turns} open {...props} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    // `title` survives only as the landmark's accessible name, never as on-screen text.
    expect(screen.getByRole("region").getAttribute("aria-label")).toBe("Hội thoại");
    expect(screen.queryByText("Hội thoại")).toBeNull();
  });

  // Mirrors DisplayPanel: the element stays mounted through its exit animation, so while
  // closing it must stop being announced and stop eating clicks.
  it("open=false → exit animation, hidden from screen readers, not clickable", () => {
    renderLog(<ConversationLog turns={turns} open={false} {...props} />);
    const region = document.querySelector('[role="region"]')!;
    expect(region.getAttribute("aria-hidden")).toBe("true");
    expect(region.className).toContain("anim-panel-out");
    expect(region.className).toContain("pointer-events-none");
  });
});
