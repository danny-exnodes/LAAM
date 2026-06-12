import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { AccessTokensManager } from "./AccessTokensManager";

const TOKENS = [
  {
    id: "t1",
    kind: "api" as const,
    name: "ci bot",
    prefix: "laam_aaaa",
    last4: "1111",
    lastUsedAt: null,
    revokedAt: null,
    createdAt: null,
  },
];

function ui(initial = TOKENS) {
  return (
    <I18nProvider lang="en">
      <AccessTokensManager initial={initial} />
    </I18nProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => vi.restoreAllMocks());

describe("AccessTokensManager", () => {
  it("lists the caller's tokens (masked prefix•••last4)", () => {
    render(ui());
    expect(screen.getByText("ci bot")).toBeInTheDocument();
    expect(screen.getByText(/laam_aaaa•••1111/)).toBeInTheDocument();
  });

  it("shows the empty state when there are no tokens", () => {
    render(ui([]));
    expect(screen.getByText(/No tokens yet/i)).toBeInTheDocument();
  });

  it("flags an admin-provisioned key with a transparency badge (createdByUserId set)", () => {
    render(ui([{ ...TOKENS[0], id: "t2", name: "given to me", createdByUserId: "admin1" }]));
    expect(screen.getByText(/Provisioned by an admin/i)).toBeInTheDocument();
  });

  it("does NOT show the badge on a self-minted key (createdByUserId null)", () => {
    render(ui([{ ...TOKENS[0], createdByUserId: null }]));
    expect(screen.queryByText(/Provisioned by an admin/i)).not.toBeInTheDocument();
  });

  it("create flow POSTs name+kind and reveals the raw token ONCE", async () => {
    const fetchMock = vi
      .fn()
      // POST /api/access-tokens
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, token: "laam_secretRAW9999", prefix: "laam_secr", last4: "9999" }) })
      // GET reload
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tokens: TOKENS }) });
    vi.stubGlobal("fetch", fetchMock);

    render(ui());
    fireEvent.change(screen.getByPlaceholderText(/Token name/i), { target: { value: "my agent" } });
    fireEvent.click(screen.getByRole("button", { name: /Create token/i }));

    await waitFor(() => expect(screen.getByText(/laam_secretRAW9999/)).toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/access-tokens");
    expect(JSON.parse(init.body)).toMatchObject({ name: "my agent", kind: "api" });
  });

  it("revoke confirms then DELETEs the token", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) }) // DELETE
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tokens: [] }) }); // reload
    vi.stubGlobal("fetch", fetchMock);

    render(ui());
    fireEvent.click(screen.getByRole("button", { name: /Revoke/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/access-tokens/t1");
    expect(init.method).toBe("DELETE");
  });
});
