import { expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { ProactiveCard, type ProactiveAlertView } from "./ProactiveCard";

function wrap(alerts: ProactiveAlertView[], onDismiss = vi.fn()) {
  render(
    <I18nProvider lang="vi">
      <ProactiveCard alerts={alerts} onDismiss={onDismiss} />
    </I18nProvider>,
  );
  return onDismiss;
}

test("renders nothing when there are no alerts", () => {
  const { container } = render(
    <I18nProvider lang="vi">
      <ProactiveCard alerts={[]} onDismiss={vi.fn()} />
    </I18nProvider>,
  );
  expect(container.querySelector("[role=alert]")).toBeNull();
});

test("renders a stuck alert with the project and idle minutes (code-derived numbers)", () => {
  wrap([{ type: "stuck", project: "laam", minutesIdle: 71 }]);
  expect(screen.getByText(/laam — agent kẹt 71 phút/)).toBeInTheDocument();
});

test("renders a cost alert formatted to 2 decimals", () => {
  wrap([{ type: "cost", project: "billing", costUsd: 39.1 }]);
  expect(screen.getByText(/billing — chi phí cao \$39\.10/)).toBeInTheDocument();
});

test("dismiss button calls onDismiss", () => {
  const onDismiss = wrap([{ type: "stuck", project: "x", minutesIdle: 12 }]);
  fireEvent.click(screen.getByLabelText("Bỏ qua"));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});
