import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AiReviewPanel } from "./AiReviewPanel";
import type { WorkflowGraph } from "@/lib/workflow/types";

const t = (k: string) => k;
const graph: WorkflowGraph = { nodes: [], edges: [] };

beforeEach(() => vi.restoreAllMocks());

describe("AiReviewPanel", () => {
  test("shows loading, then renders the model's review (markdown)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ review: "## Tóm tắt\nflow ổn" }) })) as unknown as typeof fetch,
    );
    render(<AiReviewPanel graph={graph} onClose={vi.fn()} t={t} />);
    expect(screen.getByText("wf.ai.reviewing")).toBeInTheDocument(); // loading first
    await waitFor(() => expect(screen.getByText("Tóm tắt")).toBeInTheDocument()); // markdown heading rendered
    vi.unstubAllGlobals();
  });

  test("shows the server error on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({ error: "boom" }) })) as unknown as typeof fetch,
    );
    render(<AiReviewPanel graph={graph} onClose={vi.fn()} t={t} />);
    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
    vi.unstubAllGlobals();
  });
});
