import { describe, test, expect } from "vitest";
import { synthNudge, loopTruncatedNotice, restateQuestion } from "./backstop-notice";

describe("restateQuestion", () => {
  // MEASURED (2026-08-05, Larvis Q12 of the 12-question thread): the turn completed
  // NATURALLY — zero backstops — and still answered a previous question's topic
  // (cash-drawer shortages instead of after-hours overrides). synthNudge only runs on a
  // force-stop, so the drift survives on this path. Same mechanism, different trigger.
  test("nhúng nguyên văn câu hỏi của lượt hiện tại", () => {
    const out = restateQuestion("vi", "Show all after-hours overrides and sensitive activities.");
    expect(out).toContain("Show all after-hours overrides and sensitive activities.");
  });

  // Distinct from synthNudge: nothing went wrong here, so it must NOT announce a stop —
  // that wording would leak an alarming, false caveat into a perfectly healthy turn.
  test("KHÔNG nói vòng lặp bị dừng — lượt này kết thúc bình thường", () => {
    const out = restateQuestion("vi", "abc");
    expect(out).not.toContain("đã dừng");
    expect(out).not.toContain("Đã dừng");
  });

  // The drift is answering the WRONG question, so the instruction that carries the fix is
  // "only this question, ignore earlier topics".
  test("yêu cầu bám đúng câu hỏi này, bỏ qua chủ đề của lượt trước", () => {
    const out = restateQuestion("vi", "abc");
    expect(out).toContain("lượt trước");
  });

  test("đa ngôn ngữ + lang lạ rơi về tiếng Việt", () => {
    expect(restateQuestion("en", "Which store?")).toContain("Which store?");
    expect(restateQuestion("en", "x")).toContain("ONLY this question");
    expect(restateQuestion("zh", "x")).toContain("仅回答");
    expect(restateQuestion("xx", "x")).toContain("CHỈ trả lời");
  });

  test("cắt câu hỏi quá dài", () => {
    expect(restateQuestion("vi", "x".repeat(1000))).toContain("…");
  });

  // MEASURED (2026-08-05, targeted re-run, Q12 BOTH modes): DAAB returned
  // status=clarification_needed with the clarifying question attached (the connector's tool
  // description explicitly says to relay it), and the model answered "chưa có dữ liệu"
  // instead — silently defeating the whole ask-back feature. The "say plainly it is not
  // there" instruction added for the drift fix pushed it that way, so the same nudge has to
  // carve out the clarification case.
  test("dặn CHUYỂN câu hỏi làm rõ của công cụ cho người dùng, không nuốt thành 'chưa có dữ liệu'", () => {
    const out = restateQuestion("vi", "Show all after-hours overrides.").toLowerCase();
    expect(out).toContain("làm rõ");
    expect(out).toContain("chuyển");
  });

  test("carve-out câu hỏi làm rõ có ở mọi ngôn ngữ", () => {
    expect(restateQuestion("en", "x").toLowerCase()).toContain("clarifying question");
    expect(restateQuestion("zh", "x")).toContain("澄清");
  });

  // No question text ⇒ nothing to pin ⇒ appending an empty directive would just burn a
  // turn. The caller skips on "".
  test("câu hỏi rỗng → chuỗi rỗng để caller bỏ qua, không chèn lượt thừa", () => {
    expect(restateQuestion("vi", "   ")).toBe("");
  });
});

describe("synthNudge", () => {
  // The Q12-answered-Q9 bug: with tool results evicted under the char budget, a nudge
  // that says only "answer the question" lets the model resolve "the question" to an
  // earlier turn still present in context. Naming it is the whole point of the helper —
  // a nudge that drops the question text is the regression this test must catch.
  test("nhúng nguyên văn câu hỏi để model không trả lời nhầm câu trước đó", () => {
    const out = synthNudge("vi", "Show all after-hours overrides and sensitive activities.");
    expect(out).toContain("Show all after-hours overrides and sensitive activities.");
  });

  // A force-stop means the loop ran out of room — asserting the data is sufficient
  // invites a confident answer built on partial rows. The nudge must ask for an honest
  // gap report instead.
  test("KHÔNG khẳng định dữ liệu đã đủ; yêu cầu nêu rõ phần còn thiếu", () => {
    const out = synthNudge("vi", "Câu hỏi nào đó");
    expect(out).not.toContain("Đã đủ dữ liệu");
    expect(out).toContain("còn thiếu");
    expect(out).toContain("không suy đoán");
  });

  // route.test.ts asserts the retry turn carries this phrase — the one-shot empty-reply
  // retry reuses the nudge, and a reworded nudge that drops it silently weakens that path.
  test("giữ chỉ thị 'KHÔNG gọi thêm công cụ' mà đường retry rỗng dựa vào", () => {
    expect(synthNudge("vi", "x")).toContain("KHÔNG gọi thêm công cụ");
  });

  test("mỗi ngôn ngữ có bản riêng, lang lạ rơi về tiếng Việt", () => {
    expect(synthNudge("en", "Which employee refunds the most?")).toContain("ANSWER NOW");
    expect(synthNudge("en", "Which employee refunds the most?")).toContain("Which employee refunds the most?");
    expect(synthNudge("zh", "问题")).toContain("立即作答");
    expect(synthNudge("xx", "abc")).toContain("TRẢ LỜI NGAY");
  });

  // Re-inflating the prompt with a pasted wall of text at the exact moment the loop is
  // out of room would defeat the nudge.
  test("cắt bớt câu hỏi quá dài thay vì bơm ngược cả khối text vào prompt", () => {
    const out = synthNudge("vi", "x".repeat(1000));
    expect(out).toContain("…");
    expect(out.length).toBeLessThan(800);
  });

  test("câu hỏi rỗng → vẫn ra chỉ thị hợp lệ, không có khối CÂU HỎI trống", () => {
    const out = synthNudge("vi", "   ");
    expect(out).toContain("TRẢ LỜI NGAY");
    expect(out).not.toContain("CÂU HỎI:");
  });
});

describe("loopTruncatedNotice", () => {
  // On /constellation the answer is spoken. TTS would read this parenthetical aloud as
  // part of the reply — a note about the agent's internals narrated to someone who asked
  // about refunds.
  test("voice: im lặng — TTS không đọc chú thích nội bộ ra thành lời", () => {
    expect(loopTruncatedNotice("vi", "voice")).toBe("");
    expect(loopTruncatedNotice("en", "voice")).toBe("");
  });

  // Rule 12 still holds for the reading surface: a force-stopped turn must not look
  // identical to a complete one.
  test("text: vẫn báo trung thực rằng lượt bị dừng sớm", () => {
    expect(loopTruncatedNotice("vi", "text")).toContain("chưa đầy đủ");
    expect(loopTruncatedNotice("en", "text")).toContain("may be incomplete");
    expect(loopTruncatedNotice("zh", "text")).toContain("可能不完整");
  });

  test("mode không đặt (mặc định text) vẫn hiện chú thích", () => {
    expect(loopTruncatedNotice("vi", undefined)).toContain("chưa đầy đủ");
  });
});
