import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { ConstellationClient } from "./ConstellationClient";

function mockFetch() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/api/custom-agents")) return json({ agents: [{ id: "a1", name: "Alpha" }] });
    if (url.includes("/api/chat/tools")) return json({ groups: [{ id: "connector:daab", type: "mcp", label: "DAAB", tools: [{ name: "mcp__daab__kg_query", description: "", kind: "read", args: [] }] }] });
    if (url.includes("/api/connectors")) return json({ connectors: [{ id: "gmail", name: "Gmail", status: "disconnected" }] });
    return json({});
  }));
}
const json = (b: unknown) => ({ ok: true, json: async () => b }) as Response;
const renderPage = () => render(<I18nProvider lang="vi"><ConstellationClient greetingName="Danny" lang="vi" /></I18nProvider>);

describe("ConstellationClient", () => {
  beforeEach(() => { mockFetch(); localStorage.clear(); });

  it("renders nodes from the real endpoints (agent, tool group, idle connector)", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: /Alpha/ })).toBeTruthy();
    expect(await screen.findByRole("button", { name: /DAAB/ })).toBeTruthy();
    expect(await screen.findByRole("button", { name: /Gmail/ })).toBeTruthy();
  });

  it("clicking an agent node persists customAgentId to localStorage", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Alpha/ }));
    await waitFor(() => expect(localStorage.getItem("laam:chat:agent")).toBe("a1"));
  });

  it("voice toggle control is hidden when Web Speech API is unavailable (jsdom default)", async () => {
    // jsdom does not implement SpeechRecognition or speechSynthesis — support will be {false,false}
    renderPage();
    // Wait for nodes to appear (fetch resolves), confirming the component mounted fully
    await screen.findByRole("button", { name: /Alpha/ });
    // State label text (ĐANG NGHE / LISTENING / etc.) should not be present
    expect(screen.queryByText(/ĐANG NGHE|ĐANG NÓI|SẴN SÀNG|LISTENING|SPEAKING|STANDBY/i)).toBeNull();
    // The voice toggle button should not be rendered
    expect(screen.queryByRole("button", { name: /giọng nói|voice/i })).toBeNull();
  });
});
