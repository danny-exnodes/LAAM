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
