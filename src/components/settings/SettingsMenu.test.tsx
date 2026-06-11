import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { SettingsMenu } from "./SettingsMenu";

// SignOutButton calls signOut from next-auth/react — stub it so jsdom doesn't throw.
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

// LangSelect uses useRouter from next/navigation — stub the App Router context.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams(),
}));

const USER = {
  name: "Ada",
  email: "ada@example.com",
  role: "admin",
  avatarUrl: "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp",
};

function ui(role = "admin") {
  return (
    <I18nProvider lang="en">
      <SettingsMenu user={{ ...USER, role }} />
    </I18nProvider>
  );
}

afterEach(cleanup);

describe("SettingsMenu", () => {
  it("renders the /settings/machines link", () => {
    render(ui());
    expect(screen.getByRole("link", { name: /Machines & hardware/i })).toHaveAttribute(
      "href",
      "/settings/machines",
    );
  });

  it("renders the /eval reliability link", () => {
    render(ui());
    expect(screen.getByRole("link", { name: /Reliability/i })).toHaveAttribute("href", "/eval");
  });

  it("renders the /monitoring link — mobile entry point for monitoring page", () => {
    render(ui());
    // This is the sole mobile entry point: /monitoring is absent from the bottom nav.
    // Use getAllByRole because the sub-text on other rows contains "monitoring", then
    // locate the row by its exact href.
    const links = screen.getAllByRole("link");
    const link = links.find((l) => l.getAttribute("href") === "/monitoring");
    expect(link).toBeDefined();
    expect(link).toHaveAttribute("href", "/monitoring");
  });

  it("renders the /graph link — mobile entry point for agent graph page", () => {
    render(ui());
    // This is the sole mobile entry point: /graph is absent from the bottom nav.
    const links = screen.getAllByRole("link");
    const link = links.find((l) => l.getAttribute("href") === "/graph");
    expect(link).toBeDefined();
    expect(link).toHaveAttribute("href", "/graph");
  });

  it("shows the /settings/users link for an admin (owner/admin manage users)", () => {
    render(ui("admin"));
    const link = screen.getAllByRole("link").find((l) => l.getAttribute("href") === "/settings/users");
    expect(link).toBeDefined();
  });

  it("shows the /settings/users link for an owner", () => {
    render(ui("owner"));
    const link = screen.getAllByRole("link").find((l) => l.getAttribute("href") === "/settings/users");
    expect(link).toBeDefined();
  });

  it("HIDES the /settings/users link for a member (not owner/admin)", () => {
    render(ui("member"));
    const link = screen.getAllByRole("link").find((l) => l.getAttribute("href") === "/settings/users");
    expect(link).toBeUndefined();
  });

  it("HIDES the /settings/users link for a viewer", () => {
    render(ui("viewer"));
    const link = screen.getAllByRole("link").find((l) => l.getAttribute("href") === "/settings/users");
    expect(link).toBeUndefined();
  });

  it("shows the /settings/access link for everyone (self-service tokens)", () => {
    for (const role of ["owner", "admin", "member", "viewer"]) {
      cleanup();
      render(ui(role));
      const link = screen.getAllByRole("link").find((l) => l.getAttribute("href") === "/settings/access");
      expect(link, `access link missing for ${role}`).toBeDefined();
    }
  });
});
