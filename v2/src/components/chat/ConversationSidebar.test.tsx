import { expect, test, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { ConversationSidebar } from "./ConversationSidebar";
import type { Conv } from "./types";

type Props = Parameters<typeof ConversationSidebar>[0];

const CONVS: Conv[] = [
  { id: "c1", title: "Alpha chat", updatedAt: null },
  { id: "c2", title: "Beta chat", updatedAt: null },
];

function setup(over: Partial<Props> = {}) {
  const props: Props = {
    convs: CONVS,
    activeId: "c1",
    query: "",
    onQuery: vi.fn(),
    onOpen: vi.fn(),
    onNew: vi.fn(),
    onDelete: vi.fn(),
    onRename: vi.fn(),
    ...over,
  };
  render(
    <I18nProvider lang="vi">
      <ConversationSidebar {...props} />
    </I18nProvider>,
  );
  return props;
}

test("renders conversation titles", () => {
  setup();
  expect(screen.getByText("Alpha chat")).toBeInTheDocument();
  expect(screen.getByText("Beta chat")).toBeInTheDocument();
});

test("typing in the search box calls onQuery", () => {
  const props = setup();
  fireEvent.change(screen.getByLabelText("Tìm cuộc trò chuyện"), { target: { value: "beta" } });
  expect(props.onQuery).toHaveBeenCalledWith("beta");
});

test("the list is filtered client-side by the query prop", () => {
  setup({ query: "beta" });
  expect(screen.queryByText("Alpha chat")).not.toBeInTheDocument();
  expect(screen.getByText("Beta chat")).toBeInTheDocument();
});

test("the active conversation is marked aria-current", () => {
  setup({ activeId: "c2" });
  const beta = screen.getByText("Beta chat").closest("[role=listitem]")!;
  expect(beta).toHaveAttribute("aria-current", "true");
});

test("clicking a row calls onOpen with its id", () => {
  const props = setup();
  fireEvent.click(screen.getByText("Beta chat"));
  expect(props.onOpen).toHaveBeenCalledWith("c2");
});

test("the new button calls onNew", () => {
  const props = setup();
  fireEvent.click(screen.getByLabelText("Cuộc trò chuyện mới"));
  expect(props.onNew).toHaveBeenCalledTimes(1);
});

test("delete button calls onDelete with the row id", () => {
  const props = setup();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const beta = screen.getByText("Beta chat").closest("[role=listitem]")!;
  fireEvent.click(within(beta as HTMLElement).getByLabelText("Xoá cuộc trò chuyện"));
  expect(props.onDelete).toHaveBeenCalledWith("c2");
});

test("double-clicking a title enters rename mode and Enter calls onRename", () => {
  const props = setup();
  fireEvent.doubleClick(screen.getByText("Alpha chat"));
  const input = screen.getByLabelText("Tên cuộc trò chuyện") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "Renamed" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(props.onRename).toHaveBeenCalledWith("c1", "Renamed");
});

test("the pencil action also opens rename mode", () => {
  setup();
  const alpha = screen.getByText("Alpha chat").closest("[role=listitem]")!;
  fireEvent.click(within(alpha as HTMLElement).getByLabelText("Đổi tên cuộc trò chuyện"));
  expect(screen.getByLabelText("Tên cuộc trò chuyện")).toBeInTheDocument();
});

test("Escape cancels rename without calling onRename", () => {
  const props = setup();
  fireEvent.doubleClick(screen.getByText("Alpha chat"));
  const input = screen.getByLabelText("Tên cuộc trò chuyện");
  fireEvent.change(input, { target: { value: "Nope" } });
  fireEvent.keyDown(input, { key: "Escape" });
  expect(props.onRename).not.toHaveBeenCalled();
});

test("empty state when there are no conversations", () => {
  setup({ convs: [] });
  expect(screen.getByText("Chưa có cuộc trò chuyện nào.")).toBeInTheDocument();
});

test("no-match state when the query filters everything out", () => {
  setup({ query: "zzz" });
  expect(screen.getByText("Không có cuộc trò chuyện nào khớp.")).toBeInTheDocument();
});

test("untitled fallback for a conversation with an empty title", () => {
  setup({ convs: [{ id: "c9", title: "", updatedAt: null }], activeId: "c9" });
  expect(screen.getByText("Cuộc trò chuyện mới")).toBeInTheDocument();
});
