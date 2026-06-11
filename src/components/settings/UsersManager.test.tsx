import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { UsersManager } from "./UsersManager";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const ROWS = [
  { id: "u1", name: "Ada", email: "ada@x", role: "owner" as const, disabledAt: null, createdAt: null },
  { id: "u2", name: "Bea", email: "bea@x", role: "member" as const, disabledAt: null, createdAt: null },
  { id: "u3", name: "Cy", email: "cy@x", role: "viewer" as const, disabledAt: "2026-06-10T00:00:00Z", createdAt: null },
];

function ui(opts: { currentUserId?: string; isOwner?: boolean } = {}) {
  return (
    <I18nProvider lang="en">
      <UsersManager
        initial={ROWS}
        currentUserId={opts.currentUserId ?? "u1"}
        isOwner={opts.isOwner ?? true}
      />
    </I18nProvider>
  );
}

afterEach(cleanup);
beforeEach(() => vi.restoreAllMocks());

describe("UsersManager", () => {
  it("renders every user row", () => {
    render(ui());
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Bea")).toBeInTheDocument();
    expect(screen.getByText("Cy")).toBeInTheDocument();
  });

  it("owner sees role <select> for OTHER users (can change roles)", () => {
    render(ui({ currentUserId: "u1", isOwner: true }));
    // one select per non-self row (u2, u3) = 2 selects
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
  });

  it("owner does NOT get a role <select> for their OWN row (cannot change own role)", () => {
    render(ui({ currentUserId: "u1", isOwner: true }));
    // u1 is owner+self → no select; u2,u3 → selects. Total 2, not 3.
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
  });

  it("a non-owner (admin) sees NO role selects — role change is owner-only", () => {
    render(ui({ currentUserId: "u2", isOwner: false }));
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
  });

  it("shows disabled status for an off-boarded user", () => {
    render(ui());
    expect(screen.getByText(/Disabled/i)).toBeInTheDocument();
  });

  it("disabling a user confirms then PATCHes {disabled:true}", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(ui({ currentUserId: "u1", isOwner: true }));
    // Bea (u2) is active → her action button reads "Disable".
    const buttons = screen.getAllByRole("button", { name: /Disable/i });
    fireEvent.click(buttons[0]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/users/u2");
    expect(JSON.parse(init.body)).toEqual({ disabled: true });
    vi.unstubAllGlobals();
  });

  it("does NOT PATCH when the disable confirm is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(ui({ currentUserId: "u1", isOwner: true }));
    fireEvent.click(screen.getAllByRole("button", { name: /Disable/i })[0]);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("does not render a disable button for your own row", () => {
    // current user u2 (member) → only u1 and u3 get action buttons.
    render(ui({ currentUserId: "u2", isOwner: false }));
    // u2's row has no Disable/Enable button; ensure no button targets self by
    // checking total action buttons == 2 (u1 active→Disable, u3 disabled→Enable).
    const actionButtons = [
      ...screen.queryAllByRole("button", { name: /Disable/i }),
      ...screen.queryAllByRole("button", { name: /Enable/i }),
    ];
    expect(actionButtons).toHaveLength(2);
  });
});
