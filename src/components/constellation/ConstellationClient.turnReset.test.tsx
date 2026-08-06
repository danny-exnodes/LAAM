// Critical 1 (final whole-branch review, 2026-08-04): panel/pill từ lượt trước KHÔNG
// được sót lại khi lượt MỚI không có descriptor (spec dòng 171). File test này TÁCH
// khỏi ConstellationClient.test.tsx vì file đó có 3 lỗi WebGL/THREE có sẵn, không liên
// quan — mock ParticleFieldBackground ở đây để component mount được trong jsdom mà
// không đụng tới các test/lỗi có sẵn của file kia.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { ConstellationClient } from "./ConstellationClient";

vi.mock("./ParticleFieldBackground", () => ({
  ParticleFieldBackground: () => null,
}));

const SEP = "\x1e";
function streamResponse(chunks: string[]) {
  const enc = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    headers: new Headers({ "x-conversation-id": "c1" }),
    body: {
      getReader: () => ({
        read: async () =>
          i < chunks.length
            ? { done: false, value: enc.encode(chunks[i++]) }
            : { done: true, value: undefined },
      }),
    },
  } as unknown as Response;
}

const json = (b: unknown) => ({ ok: true, json: async () => b }) as Response;

const VIEW_FRAME = {
  kind: "table",
  title: "kg_list_stores",
  source: { type: "tool", toolName: "kg_list_stores", at: 1_700_000_000_000 },
  columns: [{ key: "store_id", label: "store_id", align: "left" }],
  rows: [{ store_id: "PH-005" }],
};

function mockFetch(chatResponses: (() => Response)[]) {
  let chatCall = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/custom-agents")) return json({ agents: [] });
      if (url.includes("/api/chat/tools")) return json({ groups: [] });
      if (url.includes("/api/connectors")) return json({ connectors: [] });
      if (url.includes("/api/chat/info")) return json({ model: "m1", byteplusModels: ["m1"], claudeModels: [] });
      if (url.includes("/api/chat")) {
        const r = chatResponses[chatCall];
        chatCall += 1;
        return r ? r() : streamResponse(["ok"]);
      }
      return json({});
    }),
  );
}

const renderPage = () =>
  render(
    <I18nProvider lang="vi">
      <ConstellationClient greetingName="Danny" lang="vi" />
    </I18nProvider>,
  );

async function openChat() {
  fireEvent.click(await screen.findByRole("button", { name: /trò chuyện|chat/i }));
  await screen.findByPlaceholderText(/./);
}

async function send(text: string) {
  const input = await screen.findByPlaceholderText(/./);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter" });
}

describe("ConstellationClient — panel/pill không sót qua lượt (Critical 1)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("lượt 1 có descriptor → panel mở; lượt 2 KHÔNG có descriptor → panel đóng, không sót pill cũ", async () => {
    mockFetch([
      () => streamResponse([`Xong.${SEP}${JSON.stringify({ t: "view", d: VIEW_FRAME })}${SEP}`]),
      () => streamResponse(["Không có bảng nào cả."]),
    ]);
    renderPage();

    // Boot completes on its own schedule (real timers) — short, bounded wait.
    await waitFor(() => screen.findByRole("button", { name: /trò chuyện|chat/i }), { timeout: 5000 });
    await openChat();

    // Scoped by accessible name, NOT a bare role query: the conversation transcript is
    // also a region and it renders whenever the command input is open (which openChat()
    // just did), so `getByRole("region")` alone would match the wrong element. The panel
    // names itself after the descriptor title.
    const panel = () => screen.queryByRole("region", { name: "kg_list_stores" });

    // Turn 1: response carries a view frame → panel should appear.
    await send("lượt 1");
    await waitFor(() => expect(panel()).toBeTruthy(), { timeout: 5000 });

    // Turn 2: response carries NO view frame → panel must close, no stale pill either.
    await send("lượt 2");
    await waitFor(
      () => {
        expect(panel()).toBeNull();
        expect(screen.queryByText(/Xem bảng/)).toBeNull();
      },
      { timeout: 5000 },
    );
  }, 15000);
});
