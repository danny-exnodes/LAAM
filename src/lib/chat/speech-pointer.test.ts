import { describe, it, expect } from "vitest";
import { withPointer } from "./speech-pointer";

describe("withPointer", () => {
  it("có panel → nối câu chỉ dẫn vào cuối", () => {
    expect(withPointer("PH-005 lệch nhiều nhất.", true, "Bảng đang hiện trên màn hình."))
      .toBe("PH-005 lệch nhiều nhất. Bảng đang hiện trên màn hình.");
  });

  it("KHÔNG panel → tuyệt đối không nói câu đó (9/21 lượt đo được trả về rỗng)", () => {
    expect(withPointer("Xin lỗi, chưa có dữ liệu.", false, "Bảng đang hiện trên màn hình."))
      .toBe("Xin lỗi, chưa có dữ liệu.");
  });

  it("lời nói rỗng → không tự đẻ ra câu nói chỉ để trỏ panel", () => {
    expect(withPointer("", true, "Bảng đang hiện trên màn hình.")).toBe("");
  });
});
