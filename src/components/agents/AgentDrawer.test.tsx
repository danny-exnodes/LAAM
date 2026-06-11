import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AgentDrawer } from "./AgentDrawer";
import type { LiveSession } from "@/hooks/useLiveSessions";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const session: LiveSession = {
  id: "s1",
  projectId: null,
  projectName: "demo-project",
  source: "claude",
  model: "claude-test",
  gitBranch: null,
  status: "running",
  startedAt: null,
  lastActivity: null,
  messageCount: 2,
  toolCount: 1,
  subAgentCount: 0,
  subAgents: null,
  costUsd: 0,
  latestActivity: null,
  tokensIn: 0,
  tokensOut: 0,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("drawer scrim dims the page WITHOUT blurring it (Matte Dark: no glassmorphism)", async () => {
  globalThis.fetch = vi.fn(async () => ({
    json: async () => ({ timeline: [] }),
  })) as unknown as typeof fetch;

  const { container } = render(<AgentDrawer session={session} onClose={() => {}} />);
  expect(await screen.findByText("demo-project")).toBeInTheDocument();

  // The click-away scrim is the aria-hidden layer behind the panel. Core design
  // decision under test (QA A2): overlays dim via a translucent black layer —
  // any backdrop-blur reintroduces the banned glassmorphism.
  const scrim = container.querySelector("div[aria-hidden]") as HTMLElement;
  expect(scrim.className).toContain("bg-black/40");
  expect(scrim.className).not.toMatch(/backdrop-blur/);
});
