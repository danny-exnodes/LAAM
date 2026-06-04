import { afterEach, describe, expect, test, vi } from "vitest";
import gdrive from "./google-drive";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("google-drive connector", () => {
  test("identity + tool names", () => {
    expect(gdrive.id).toBe("google-drive");
    expect(gdrive.tools.map((t) => t.function.name)).toEqual(["gdrive_list_files", "gdrive_search"]);
  });

  test("gdrive_list_files maps file fields", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({
        files: [{ id: "f1", name: "Doc", mimeType: "application/pdf", modifiedTime: "t", webViewLink: "u" }],
      }),
    );
    const r = (await gdrive.handlers.gdrive_list_files({}, { access_token: "ya29" })) as {
      files: { id: string; name: string; type: string; url: string }[];
    };
    expect(r.files[0]).toMatchObject({ id: "f1", name: "Doc", type: "application/pdf", url: "u" });
  });

  test("missing access token throws", async () => {
    await expect(gdrive.handlers.gdrive_list_files({}, {})).rejects.toThrow(/access token/);
  });
});
