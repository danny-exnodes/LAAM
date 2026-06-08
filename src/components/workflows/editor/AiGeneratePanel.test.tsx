import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AiGeneratePanel } from "./AiGeneratePanel";

const t = (k: string) => k; // identity → keys are the visible labels

beforeEach(() => vi.restoreAllMocks());

describe("AiGeneratePanel", () => {
  test("generate → POSTs the prompt, applies the returned graph, then closes", async () => {
    const graph = { nodes: [{ id: "a", kind: "agent", prompt: "x" }], edges: [] };
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve({ ok: true, json: async () => ({ graph }) }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(<AiGeneratePanel onApply={onApply} onClose={onClose} t={t} />);
    fireEvent.change(screen.getByLabelText("wf.ai.title"), { target: { value: "make a flow" } });
    fireEvent.click(screen.getByText("wf.ai.generate"));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(graph));
    expect(onClose).toHaveBeenCalled();
    const sentBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(sentBody.prompt).toBe("make a flow");
    vi.unstubAllGlobals();
  });

  test("shows the server error and does NOT apply on failure", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({ error: "boom" }) }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    const onApply = vi.fn();

    render(<AiGeneratePanel onApply={onApply} onClose={vi.fn()} t={t} />);
    fireEvent.change(screen.getByLabelText("wf.ai.title"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("wf.ai.generate"));

    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
    expect(onApply).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  test("Generate is disabled until there's a prompt; an example chip fills it", () => {
    render(<AiGeneratePanel onApply={vi.fn()} onClose={vi.fn()} t={t} />);
    const gen = screen.getByText("wf.ai.generate").closest("button")!;
    expect(gen).toBeDisabled();
    fireEvent.click(screen.getByText("wf.ai.ex1"));
    expect((screen.getByLabelText("wf.ai.title") as HTMLTextAreaElement).value).toBe("wf.ai.ex1");
    expect(gen).not.toBeDisabled();
  });

  test("with a current graph: defaults to Edit mode and sends { prompt, current } (refine)", async () => {
    const current = { nodes: [{ id: "a", kind: "agent" as const, prompt: "x" }], edges: [] };
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve({ ok: true, json: async () => ({ graph: current }) }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    render(<AiGeneratePanel onApply={vi.fn()} onClose={vi.fn()} t={t} currentGraph={current} />);
    expect(screen.getByText("wf.ai.modeEdit")).toBeInTheDocument(); // mode toggle present
    fireEvent.change(screen.getByLabelText("wf.ai.title"), { target: { value: "đổi sang Gmail" } });
    fireEvent.click(screen.getByText("wf.ai.generate"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(sent).toMatchObject({ prompt: "đổi sang Gmail", current });
    vi.unstubAllGlobals();
  });
});
