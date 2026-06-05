import { describe, expect, test } from "vitest";
import { encodeFrame, splitFrames, FRAME_SEP } from "./frames";

describe("encodeFrame / splitFrames", () => {
  test("encode bọc cặp SEP + JSON", () => {
    expect(encodeFrame({ t: "tokens", i: 3, o: 5 })).toBe(`${FRAME_SEP}{"t":"tokens","i":3,"o":5}${FRAME_SEP}`);
  });
  test("text thuần (không frame) trả nguyên văn", () => {
    expect(splitFrames("xin chào")).toEqual({ text: "xin chào", frames: [] });
  });
  test("text + frame đuôi → tách text & frame", () => {
    const raw = "Trả lời." + encodeFrame({ t: "tokens", i: 1, o: 2 });
    expect(splitFrames(raw)).toEqual({ text: "Trả lời.", frames: [{ t: "tokens", i: 1, o: 2 }] });
  });
  test("nhiều frame ở đuôi", () => {
    const raw = "ok" +
      encodeFrame({ t: "tool", phase: "call", c: 0, name: "laam_find_stuck" }) +
      encodeFrame({ t: "cite", names: ["laam_find_stuck"] }) +
      encodeFrame({ t: "tokens", i: 9, o: 4 });
    const { text, frames } = splitFrames(raw);
    expect(text).toBe("ok");
    expect(frames).toHaveLength(3);
    expect(frames[2]).toEqual({ t: "tokens", i: 9, o: 4 });
  });
  test("GUARD: frame đuôi CHƯA đóng (1 SEP mở) → loại khỏi text, KHÔNG render", () => {
    const raw = "Câu trả lời" + FRAME_SEP + '{"t":"tokens","i:'; // cắt giữa frame
    expect(splitFrames(raw)).toEqual({ text: "Câu trả lời", frames: [] });
  });
  test("GUARD áp per-chunk: SEP mở ở cuối buffer không rò ra text", () => {
    expect(splitFrames("đang gõ" + FRAME_SEP).text).toBe("đang gõ");
  });
  test("frame JSON hỏng → bỏ qua (fail-soft), text vẫn sạch", () => {
    const raw = "hi" + FRAME_SEP + "{bad json}" + FRAME_SEP + "đuôi";
    expect(splitFrames(raw)).toEqual({ text: "hiđuôi", frames: [] });
  });
});
