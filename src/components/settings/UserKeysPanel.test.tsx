import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { UserKeysPanel } from "./UserKeysPanel";

type Tok = {
  id: string;
  kind: "api" | "mcp";
  name: string;
  prefix: string;
  last4: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string | null;
  createdByUserId: string | null;
};

let getTokens: Tok[] = [];
let postBody: Record<string, unknown> | null = null;
let deleteUrl: string | null = null;

function installFetch() {
  const fetchMock = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? "GET";
    if (method === "POST") {
      postBody = JSON.parse(init!.body!);
      return { ok: true, json: async () => ({ ok: true, token: "laam_PROVISIONED_RAW" }) } as Response;
    }
    if (method === "DELETE") {
      deleteUrl = url;
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    }
    // GET ?userId
    return { ok: true, json: async () => ({ tokens: getTokens }) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock as never);
  return fetchMock;
}

function ui(opts: Partial<{ isSelf: boolean; nameById: Record<string, string> }> = {}) {
  return (
    <I18nProvider lang="en">
      <UserKeysPanel
        userId="u2"
        userName="Bea"
        isSelf={opts.isSelf ?? false}
        nameById={opts.nameById ?? {}}
      />
    </I18nProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.restoreAllMocks();
  getTokens = [];
  postBody = null;
  deleteUrl = null;
});

describe("UserKeysPanel", () => {
  it("on the admin's OWN row → shows the self-service hint and NEVER fetches", () => {
    const fetchMock = installFetch();
    render(ui({ isSelf: true }));
    expect(screen.getByText(/Create your own keys/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads the target user's keys via GET ?userId=<id>", async () => {
    getTokens = [
      { id: "k1", kind: "mcp", name: "agent x", prefix: "laam_aaaa", last4: "1111", lastUsedAt: null, revokedAt: null, createdAt: null, createdByUserId: null },
    ];
    const fetchMock = installFetch();
    render(ui());
    await waitFor(() => expect(screen.getByText("agent x")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/access-tokens?userId=u2"));
  });

  it("always shows the honest scope warning before provisioning", async () => {
    installFetch();
    render(ui());
    // names the target and states the key is org-shared, read-only, on their behalf
    expect(screen.getByText(/on behalf of Bea/i)).toBeInTheDocument();
    expect(screen.getByText(/org-shared, read-only/i)).toBeInTheDocument();
  });

  it("provisioning POSTs {name, kind, forUserId} and reveals the raw token once", async () => {
    installFetch();
    render(ui());
    fireEvent.change(screen.getByPlaceholderText(/Key name/i), { target: { value: "ci key" } });
    fireEvent.click(screen.getByRole("button", { name: /Provision key/i }));
    await waitFor(() => expect(screen.getByText(/laam_PROVISIONED_RAW/)).toBeInTheDocument());
    expect(postBody).toEqual({ name: "ci key", kind: "api", forUserId: "u2" });
  });

  it("labels a key with who provisioned it, resolved via nameById", async () => {
    getTokens = [
      { id: "k2", kind: "api", name: "prov key", prefix: "laam_bbbb", last4: "2222", lastUsedAt: null, revokedAt: null, createdAt: null, createdByUserId: "admin1" },
    ];
    installFetch();
    render(ui({ nameById: { admin1: "Alice" } }));
    await waitFor(() => expect(screen.getByText(/provisioned by Alice/i)).toBeInTheDocument());
  });

  it("revoke confirms then DELETEs the target's key", async () => {
    getTokens = [
      { id: "k3", kind: "mcp", name: "to revoke", prefix: "laam_cccc", last4: "3333", lastUsedAt: null, revokedAt: null, createdAt: null, createdByUserId: null },
    ];
    vi.spyOn(window, "confirm").mockReturnValue(true);
    installFetch();
    render(ui());
    await waitFor(() => expect(screen.getByText("to revoke")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Revoke/i }));
    await waitFor(() => expect(deleteUrl).toBe("/api/access-tokens/k3"));
  });
});
