import { afterEach, expect, test, vi } from "vitest";

// The Agents LIST page is now subsumed by the Monitoring "Agents" tab. The route
// must redirect to /monitoring?tab=agents (the detail /agents/[id] waterfall stays).
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));

import AgentsPage from "./page";

afterEach(() => {
  redirect.mockClear();
});

test("redirects to /monitoring?tab=agents", () => {
  // redirect() throws to halt rendering (next/navigation contract); assert both
  // the throw and that the redirect target is the Agents tab of Monitoring.
  expect(() => AgentsPage()).toThrow("REDIRECT:/monitoring?tab=agents");
  expect(redirect).toHaveBeenCalledWith("/monitoring?tab=agents");
});
