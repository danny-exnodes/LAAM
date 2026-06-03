import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  toCsv,
  toMarkdown,
  downloadCsv,
  downloadJson,
  downloadMarkdown,
  downloadPdf,
} from "./index";

describe("export index", () => {
  it("re-exports the pure serializers", () => {
    expect(typeof toCsv).toBe("function");
    expect(typeof toMarkdown).toBe("function");
  });
});

describe("browser download helpers", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => "blob:mock");
    revokeObjectURL = vi.fn();
    // jsdom does not implement URL.createObjectURL.
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("downloadCsv creates a blob URL and clicks an anchor", () => {
    downloadCsv("data.csv", [{ v: "1" }], ["v"]);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("downloadJson creates a blob URL and clicks an anchor", () => {
    downloadJson("data.json", { a: 1 });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("downloadMarkdown creates a blob URL and clicks an anchor", () => {
    downloadMarkdown("c.md", "# hi");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("downloadPdf creates a blob URL and clicks an anchor", () => {
    downloadPdf("r.pdf", "Title", "Body");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("revokes the blob URL after the download starts", () => {
    vi.useFakeTimers();
    downloadJson("data.json", { a: 1 });
    vi.advanceTimersByTime(2000);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
