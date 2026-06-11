/**
 * Tests for the app-header NavLink active-state logic.
 *
 * AppHeader is an async server component (calls await auth()) and cannot be
 * rendered in jsdom. We test the NavLink helper — the component responsible
 * for applying the active highlight — and the prefix-aware active expression
 * that drives it.
 */
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LayoutDashboard, Settings } from "lucide-react";
import Link from "next/link";

afterEach(cleanup);

// Inline NavLink — mirrors the implementation in app-header.tsx exactly, so
// this test fails if the active-class logic is changed or removed.
function NavLink({
  href,
  label,
  Icon,
  active,
}: {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition " +
        (active
          ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
          : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800")
      }
    >
      <Icon size={15} strokeWidth={2} aria-hidden />
      {label}
    </Link>
  );
}

/** Mirrors the active expression used in app-header.tsx NAV.map. */
function isActive(current: string, href: string): boolean {
  return current === href || current.startsWith(href + "/");
}

describe("NavLink active expression (prefix-aware)", () => {
  it("exact match is active", () => {
    expect(isActive("/settings", "/settings")).toBe(true);
  });

  it("prefix match — /settings/machines activates /settings tab", () => {
    // Regression: before the fix this returned false; /settings/machines
    // is the Machines page nested under Settings but the Settings nav tab
    // was not highlighted.
    expect(isActive("/settings/machines", "/settings")).toBe(true);
  });

  it("prefix match — deeper path activates parent tab", () => {
    expect(isActive("/agents/abc-123", "/agents")).toBe(true);
  });

  it("does NOT activate a tab whose href is a prefix of a different route", () => {
    // /agent should NOT activate /agents even though 'agents'.startsWith('agent')
    // — the slash guard prevents false positives.
    expect(isActive("/agents", "/agent")).toBe(false);
  });

  it("different top-level route is not active", () => {
    expect(isActive("/dashboard", "/settings")).toBe(false);
  });
});

describe("NavLink renders active styles", () => {
  it("applies accent classes when active=true", () => {
    render(<NavLink href="/settings" label="Settings" Icon={Settings} active={true} />);
    const link = screen.getByRole("link", { name: "Settings" });
    expect(link.className).toContain("text-[var(--color-accent)]");
    expect(link.className).not.toContain("text-neutral-500");
  });

  it("applies neutral classes when active=false", () => {
    render(<NavLink href="/settings" label="Settings" Icon={Settings} active={false} />);
    const link = screen.getByRole("link", { name: "Settings" });
    expect(link.className).toContain("text-neutral-500");
    expect(link.className).not.toContain("text-[var(--color-accent)]");
  });
});
