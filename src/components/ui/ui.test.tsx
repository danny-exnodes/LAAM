import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MatteCard } from "./matte-card";
import { MatteButton } from "./matte-button";
import { Bloom } from "./bloom";

afterEach(cleanup);

// ── MatteCard ──────────────────────────────────────────────────────────────

test("MatteCard renders children on an opaque, NON-blurred surface", () => {
  const { container } = render(<MatteCard>hello</MatteCard>);
  expect(screen.getByText("hello")).toBeInTheDocument();
  const card = container.firstElementChild as HTMLElement;
  // Core decision under test: Matte Dark is opaque — depth comes from Bloom,
  // never from translucency. If anyone reintroduces glassmorphism here, fail.
  expect(card.className).not.toMatch(/backdrop-blur/);
  expect(card.className).toContain("bg-[var(--surface-1)]");
});

test("MatteCard renders a provided bloom node behind the content", () => {
  render(
    <MatteCard bloom={<div data-testid="bloom-slot" />}>body</MatteCard>,
  );
  expect(screen.getByTestId("bloom-slot")).toBeInTheDocument();
  expect(screen.getByText("body")).toBeInTheDocument();
});

test("MatteCard accent tone switches the border token", () => {
  const { container } = render(<MatteCard tone="accent">x</MatteCard>);
  const card = container.firstElementChild as HTMLElement;
  expect(card.className).toContain("border-[var(--accent-glow)]");
});

// ── Bloom ──────────────────────────────────────────────────────────────────

test("Bloom is decorative: aria-hidden and never traps pointer events", () => {
  const { container } = render(<Bloom />);
  const el = container.firstElementChild as HTMLElement;
  // Intent: a glow is cosmetic. It must not be focusable, clickable, or read by
  // assistive tech — otherwise it would intercept clicks on the card beneath it.
  expect(el).toHaveAttribute("aria-hidden", "true");
  expect(el.className).toContain("pointer-events-none");
});

test("Bloom positions the gradient origin from its position prop", () => {
  const { container } = render(<Bloom position="top-left" />);
  const el = container.firstElementChild as HTMLElement;
  expect(el.style.background).toContain("at 0% 0%");
});

// ── MatteButton ──────────────────────────────────────────────────────────────

test("MatteButton always exposes a visible keyboard focus ring", () => {
  render(<MatteButton>Buy</MatteButton>);
  const btn = screen.getByRole("button", { name: "Buy" });
  // a11y is a hard constraint: keyboard users must see focus. This test fails if
  // the focus-visible ring is ever dropped from any variant's base classes.
  expect(btn.className).toContain("focus-visible:ring-2");
});

test("MatteButton primary variant uses the matte accent fill", () => {
  render(<MatteButton variant="primary">Go</MatteButton>);
  const btn = screen.getByRole("button", { name: "Go" });
  expect(btn.className).toContain("bg-[var(--accent)]");
});

test("MatteButton forwards click + disabled to the underlying button", () => {
  const onClick = vi.fn();
  const { rerender } = render(<MatteButton onClick={onClick}>Tap</MatteButton>);
  fireEvent.click(screen.getByRole("button", { name: "Tap" }));
  expect(onClick).toHaveBeenCalledTimes(1);

  rerender(
    <MatteButton onClick={onClick} disabled>
      Tap
    </MatteButton>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Tap" }));
  expect(onClick).toHaveBeenCalledTimes(1); // unchanged — disabled blocks it
});
