import { expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { SettingsPanel } from "./SettingsPanel";
import { DEFAULT_SETTINGS } from "./types";

type Props = Parameters<typeof SettingsPanel>[0];

function setup(over: Partial<Props> = {}) {
  const props: Props = {
    settings: DEFAULT_SETTINGS,
    models: ["gemma4:e4b", "qwen3-vl:8b"],
    onChange: vi.fn(),
    ...over,
  };
  render(
    <I18nProvider lang="vi">
      <SettingsPanel {...props} />
    </I18nProvider>,
  );
  return props;
}

test("model select lists the provided models and reflects settings.model", () => {
  setup({ settings: { ...DEFAULT_SETTINGS, model: "qwen3-vl:8b" } });
  const sel = screen.getByLabelText("Mô hình") as HTMLSelectElement;
  expect(sel.value).toBe("qwen3-vl:8b");
  expect(screen.getByRole("option", { name: "gemma4:e4b" })).toBeInTheDocument();
});

test("changing the model calls onChange with the new model", () => {
  const props = setup();
  fireEvent.change(screen.getByLabelText("Mô hình"), { target: { value: "qwen3-vl:8b" } });
  expect(props.onChange).toHaveBeenCalledWith(
    expect.objectContaining({ model: "qwen3-vl:8b" }),
  );
});

test("temperature slider change calls onChange with the new temperature", () => {
  const props = setup();
  fireEvent.change(screen.getByLabelText(/Nhiệt độ/), { target: { value: "1.2" } });
  expect(props.onChange).toHaveBeenCalledWith(
    expect.objectContaining({ temperature: 1.2 }),
  );
});

test("topP slider change calls onChange with the new topP", () => {
  const props = setup();
  fireEvent.change(screen.getByLabelText(/Top-p/), { target: { value: "0.5" } });
  expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ topP: 0.5 }));
});

test("system textarea change calls onChange with the new system prompt", () => {
  const props = setup();
  fireEvent.change(screen.getByLabelText(/Lời nhắc hệ thống/), {
    target: { value: "be concise" },
  });
  expect(props.onChange).toHaveBeenCalledWith(
    expect.objectContaining({ system: "be concise" }),
  );
});

test("displayed temperature and topP values reflect the settings prop", () => {
  setup({ settings: { ...DEFAULT_SETTINGS, temperature: 0.3, topP: 0.7 } });
  expect(screen.getByText("0.3")).toBeInTheDocument();
  expect(screen.getByText("0.70")).toBeInTheDocument();
});

// --- C2: optgroup rendering ---

test("flat <option> list rendered when claudeModels is empty (unchanged DOM)", () => {
  // INTENT: when claudeModels is absent/empty, the select must stay flat — no optgroup
  // breakage for the common case where the server has no ANTHROPIC_API_KEY.
  setup({ models: ["gemma4:e4b", "qwen3-vl:8b"] });
  // No optgroup elements should exist.
  const sel = screen.getByLabelText("Mô hình") as HTMLSelectElement;
  expect(sel.querySelectorAll("optgroup")).toHaveLength(0);
  // Both models still appear as flat options.
  expect(screen.getByRole("option", { name: "gemma4:e4b" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "qwen3-vl:8b" })).toBeInTheDocument();
});

test("two optgroups rendered when claudeModels is non-empty", () => {
  // INTENT: when claudeModels has entries, the select must show local + Claude groups
  // so users can visually distinguish free-local from billed-API models.
  setup({
    models: ["gemma4:e4b"],
    claudeModels: ["claude-sonnet-4-6", "claude-opus-4-8"],
  });
  const sel = screen.getByLabelText("Mô hình") as HTMLSelectElement;
  const groups = sel.querySelectorAll("optgroup");
  expect(groups).toHaveLength(2);
  // Local group includes the Ollama model.
  expect(screen.getByRole("option", { name: "gemma4:e4b" })).toBeInTheDocument();
  // Claude group includes both Claude models.
  expect(screen.getByRole("option", { name: "claude-sonnet-4-6" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "claude-opus-4-8" })).toBeInTheDocument();
});

test("local optgroup label contains '$0' (free indicator)", () => {
  // INTENT: the local group must be clearly labelled as free — key product differentiation.
  setup({
    models: ["gemma4:e4b"],
    claudeModels: ["claude-sonnet-4-6"],
  });
  const sel = screen.getByLabelText("Mô hình") as HTMLSelectElement;
  const [localGroup] = Array.from(sel.querySelectorAll("optgroup"));
  expect(localGroup.label).toContain("$0");
});

test("claude optgroup label contains 'tính phí' (billing indicator in vi)", () => {
  // INTENT: the Claude group must be clearly labelled as billed so users are not
  // surprised by charges — honesty-first per product decision QUYẾT ĐỊNH #6.
  setup({
    models: ["gemma4:e4b"],
    claudeModels: ["claude-sonnet-4-6"],
  });
  const sel = screen.getByLabelText("Mô hình") as HTMLSelectElement;
  const groups = Array.from(sel.querySelectorAll("optgroup"));
  const claudeGroup = groups[1];
  expect(claudeGroup.label).toContain("tính phí");
});

test("selecting a claude model calls onChange with that model value", () => {
  // INTENT: model change must propagate even when the option is inside an optgroup.
  const props = setup({
    models: ["gemma4:e4b"],
    claudeModels: ["claude-sonnet-4-6", "claude-opus-4-8"],
  });
  fireEvent.change(screen.getByLabelText("Mô hình"), {
    target: { value: "claude-sonnet-4-6" },
  });
  expect(props.onChange).toHaveBeenCalledWith(
    expect.objectContaining({ model: "claude-sonnet-4-6" }),
  );
});
