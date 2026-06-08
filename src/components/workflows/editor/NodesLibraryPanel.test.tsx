import { describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NodesLibraryPanel, NODE_KIND_MIME } from "./NodesLibraryPanel";

const t = (k: string) => k; // identity → i18n keys are the visible labels

describe("NodesLibraryPanel", () => {
  test("renders a card for each of the 4 node kinds", () => {
    render(<NodesLibraryPanel onAdd={vi.fn()} t={t} mode="docked" onSetMode={vi.fn()} />);
    for (const k of ["agent", "connector", "condition", "foreach"]) {
      expect(screen.getByText(`wf.lib.${k}.name`)).toBeInTheDocument();
    }
  });

  test("clicking a card calls onAdd with that kind", () => {
    const onAdd = vi.fn();
    render(<NodesLibraryPanel onAdd={onAdd} t={t} mode="docked" onSetMode={vi.fn()} />);
    fireEvent.click(screen.getByText("wf.lib.connector.name"));
    expect(onAdd).toHaveBeenCalledWith("connector");
  });

  test("dragging a card sets the node kind on the dataTransfer (drag-to-add)", () => {
    render(<NodesLibraryPanel onAdd={vi.fn()} t={t} mode="docked" onSetMode={vi.fn()} />);
    const setData = vi.fn();
    const card = screen.getByText("wf.lib.agent.name").closest("button")!;
    fireEvent.dragStart(card, { dataTransfer: { setData, effectAllowed: "" } });
    expect(setData).toHaveBeenCalledWith(NODE_KIND_MIME, "agent");
  });

  test("hide button switches to 'hidden'", () => {
    const onSetMode = vi.fn();
    render(<NodesLibraryPanel onAdd={vi.fn()} t={t} mode="docked" onSetMode={onSetMode} />);
    fireEvent.click(screen.getByRole("button", { name: "wf.lib.hide" }));
    expect(onSetMode).toHaveBeenCalledWith("hidden");
  });

  test("float/dock button toggles between docked and float", () => {
    const onSetMode = vi.fn();
    const { rerender } = render(<NodesLibraryPanel onAdd={vi.fn()} t={t} mode="docked" onSetMode={onSetMode} />);
    fireEvent.click(screen.getByRole("button", { name: "wf.lib.float" }));
    expect(onSetMode).toHaveBeenCalledWith("float");
    rerender(<NodesLibraryPanel onAdd={vi.fn()} t={t} mode="float" onSetMode={onSetMode} />);
    fireEvent.click(screen.getByRole("button", { name: "wf.lib.dock" }));
    expect(onSetMode).toHaveBeenCalledWith("docked");
  });
});
