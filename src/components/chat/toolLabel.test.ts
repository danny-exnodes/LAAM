import { describe, expect, test } from "vitest";
import { toolLabel } from "./toolLabel";

const fakeT = (key: string) => ({
  "chat.toolFindStuck": "Tìm agent kẹt",
}[key] ?? key);

describe("toolLabel", () => {
  test("internal đã map → nhãn i18n", () => {
    expect(toolLabel("laam_find_stuck", fakeT)).toBe("Tìm agent kẹt");
  });
  test("connector chưa map → humanize tên thô", () => {
    expect(toolLabel("github_list_repos", fakeT)).toBe("github list repos");
  });
});
