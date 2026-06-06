import { describe, expect, test, vi } from "vitest";
vi.mock("@/db", () => ({ db: {} })); // registry → connectors có thể chạm @/db lúc import — stub
import { allConnectorSchemas, padToN } from "./distractors";
import type { ConnectorTool } from "@/lib/connectors/types";

const t = (name: string): ConnectorTool => ({ type: "function", kind: "read", function: { name, description: "", parameters: {} } });

describe("allConnectorSchemas", () => {
  test("lấy schema connector THẬT (>5, mọi cái có tên)", () => {
    const s = allConnectorSchemas();
    expect(s.length).toBeGreaterThan(5);
    expect(s.every((x) => typeof x.function.name === "string" && x.function.name.length > 0)).toBe(true);
  });
});

describe("padToN", () => {
  const correct = [t("web_search")];
  const distractors = [t("github_list_repos"), t("trello_create_card"), t("gmail_send")];
  test("giữ correct + đệm distractor tới N, loại trùng tên correct", () => {
    const u = padToN(correct, [t("web_search"), ...distractors], 3);
    expect(u.map((x) => x.function.name)).toEqual(["web_search", "github_list_repos", "trello_create_card"]);
  });
  test("N nhỏ hơn số correct → vẫn giữ đủ correct (không cắt mất đáp án)", () => {
    expect(padToN(correct, distractors, 0).map((x) => x.function.name)).toEqual(["web_search"]);
  });
});
