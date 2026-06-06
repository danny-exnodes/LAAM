import { afterEach, describe, expect, test, vi } from "vitest";
import gdrive from "./google-drive";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("google-drive connector", () => {
  test("identity + tool names", () => {
    expect(gdrive.id).toBe("google-drive");
    expect(gdrive.auth.type).toBe("oauth");
    expect(gdrive.tools.map((t) => t.function.name)).toEqual([
      "gdrive_list_files",
      "gdrive_search",
      "gdrive_get_file",
      "gdrive_export_text",
      "gdrive_create_folder",
    ]);
  });

  test("write scope requested for file creation", () => {
    expect(gdrive.auth.scopes).toContain("https://www.googleapis.com/auth/drive.file");
    // read-only scope retained
    expect(gdrive.auth.scopes).toContain("https://www.googleapis.com/auth/drive.readonly");
  });

  test("create-folder tool is the only write tool", () => {
    const writes = gdrive.tools.filter((t) => t.kind === "write").map((t) => t.function.name);
    expect(writes).toEqual(["gdrive_create_folder"]);
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

  test("gdrive_get_file returns shaped file + size", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({
        id: "f1",
        name: "Report",
        mimeType: "application/pdf",
        modifiedTime: "t",
        webViewLink: "u",
        size: "1024",
      }),
    );
    const r = (await gdrive.handlers.gdrive_get_file({ fileId: "f1" }, { access_token: "ya29" })) as {
      file: { id: string; name: string; type: string; url: string };
      size: string | null;
    };
    expect(r.file).toMatchObject({ id: "f1", name: "Report", type: "application/pdf", url: "u" });
    expect(r.size).toBe("1024");
  });

  test("gdrive_export_text returns raw text body (truncated)", async () => {
    const long = "x".repeat(9000);
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(long, { status: 200 }));
    const r = (await gdrive.handlers.gdrive_export_text({ fileId: "doc1" }, { access_token: "ya29" })) as {
      text: string;
    };
    expect(r.text).toHaveLength(8000);
    expect(r.text).toBe("x".repeat(8000));
  });

  test("gdrive_create_folder POSTs folder body and shapes result", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(Response.json({ id: "new1", name: "Reports", webViewLink: "https://view/new1" }));
    const r = (await gdrive.handlers.gdrive_create_folder(
      { name: "Reports", parentId: "p1" },
      { access_token: "ya29" },
    )) as { folder: { id: string; name: string; url: string } };

    expect(r.folder).toEqual({ id: "new1", name: "Reports", url: "https://view/new1" });
    // assert it was a POST with the folder mimeType + parents in the JSON body
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      name: "Reports",
      mimeType: "application/vnd.google-apps.folder",
      parents: ["p1"],
    });
  });

  test("gdrive_create_folder falls back to a Drive folder URL when webViewLink absent", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(Response.json({ id: "new2", name: "NoLink" }));
    const r = (await gdrive.handlers.gdrive_create_folder({ name: "NoLink" }, { access_token: "ya29" })) as {
      folder: { url: string };
    };
    expect(r.folder.url).toBe("https://drive.google.com/drive/folders/new2");
  });

  test("missing access token throws", async () => {
    await expect(gdrive.handlers.gdrive_list_files({}, {})).rejects.toThrow(/access token/);
  });
});
