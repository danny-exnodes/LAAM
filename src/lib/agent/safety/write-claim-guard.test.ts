import { describe, expect, test } from "vitest";
import {
  looksLikeWriteIntent,
  assertsCompletedWrite,
  guardWriteClaim,
  SAFE_UNBACKED_WRITE,
} from "./write-claim-guard";

// F1 (QA 2026-06-06): the local model (qwen3-vl:8b) sometimes narrates a WRITE
// as done ("Sự kiện … đã được tạo thành công") WITHOUT emitting the tool_call.
// In the main turn a real write ALWAYS suspends (PendingWriteSignal) before it
// can execute, so any "write succeeded" claim that reaches the completion is
// provably false (Rule 13 — never trust the model's prose over a real tool
// result). This guard is the deterministic safety net.

describe("looksLikeWriteIntent — does the USER ask to mutate an external system?", () => {
  test("Vietnamese create/send/delete/update intents → true", () => {
    expect(looksLikeWriteIntent("Tạo sự kiện Google Calendar tên 'LAAM QA test'")).toBe(true);
    expect(looksLikeWriteIntent("Gửi email tới sếp về cuộc họp")).toBe(true);
    expect(looksLikeWriteIntent("Xoá file báo cáo cũ trên Drive")).toBe(true);
    expect(looksLikeWriteIntent("Cập nhật thẻ Trello sang Done")).toBe(true);
    expect(looksLikeWriteIntent("Đặt lịch họp 3h chiều mai")).toBe(true);
  });

  test("English create/send/delete intents → true", () => {
    expect(looksLikeWriteIntent("Create a calendar event named X at 3pm")).toBe(true);
    expect(looksLikeWriteIntent("Send an email to the team")).toBe(true);
    expect(looksLikeWriteIntent("Please delete that file")).toBe(true);
  });

  test("Chinese create/send intents → true", () => {
    expect(looksLikeWriteIntent("创建一个日历事件")).toBe(true);
    expect(looksLikeWriteIntent("给我发送一封邮件")).toBe(true);
  });

  test("read / list / plain-chat asks → false (these keep live streaming)", () => {
    expect(looksLikeWriteIntent("Liệt kê sự kiện Calendar tuần này")).toBe(false);
    expect(looksLikeWriteIntent("Cho tôi xem 3 email gần đây")).toBe(false);
    expect(looksLikeWriteIntent("Hôm nay thời tiết thế nào?")).toBe(false);
    expect(looksLikeWriteIntent("list my repos")).toBe(false);
    expect(looksLikeWriteIntent("列出我最近的邮件")).toBe(false);
    expect(looksLikeWriteIntent("")).toBe(false);
  });
});

describe("assertsCompletedWrite — does the ASSISTANT claim a write already happened?", () => {
  test("the exact QA confabulation (vi) → true", () => {
    expect(
      assertsCompletedWrite("Sự kiện 'LAAM QA test' đã được tạo thành công trên Google Calendar."),
    ).toBe(true);
  });

  test("other completed-write phrasings (vi/en/zh) → true", () => {
    expect(assertsCompletedWrite("Mình đã gửi email cho bạn rồi.")).toBe(true);
    expect(assertsCompletedWrite("Đã xoá tệp thành công.")).toBe(true);
    expect(assertsCompletedWrite("Your event has been created successfully.")).toBe(true);
    expect(assertsCompletedWrite("I've sent the email to the team.")).toBe(true);
    expect(assertsCompletedWrite("邮件已发送。")).toBe(true);
    expect(assertsCompletedWrite("已成功创建事件。")).toBe(true);
  });

  test("future tense / offers / questions → false (not a completed-write claim)", () => {
    expect(assertsCompletedWrite("Mình sẽ tạo sự kiện đó cho bạn ngay.")).toBe(false);
    expect(assertsCompletedWrite("Bạn có muốn mình tạo sự kiện này không?")).toBe(false);
    expect(assertsCompletedWrite("I will create the event for you.")).toBe(false);
  });

  test("plain read/answer text → false (no false positives on normal replies)", () => {
    expect(assertsCompletedWrite("Đây là 3 email gần đây của bạn: …")).toBe(false);
    expect(assertsCompletedWrite("Here are your repositories: a, b, c.")).toBe(false);
    expect(assertsCompletedWrite("Hôm nay là thứ Bảy, trời nắng.")).toBe(false);
  });

  // Review FN fix: "vừa <verb>", "<verb> … rồi", and passive "được <verb> … thành
  // công" are common Vietnamese completion forms the model may use — must be caught.
  test("vừa / …rồi / passive được…thành công (vi) → true", () => {
    expect(assertsCompletedWrite("Tôi vừa thêm sự kiện vào lịch của bạn.")).toBe(true);
    expect(assertsCompletedWrite("Mình vừa gửi email cho team rồi nhé.")).toBe(true);
    expect(assertsCompletedWrite("Mình tạo sự kiện cho bạn rồi nhé.")).toBe(true);
    expect(assertsCompletedWrite("Sự kiện được tạo thành công.")).toBe(true); // passive, no "đã"
    expect(assertsCompletedWrite("已成功创建事件。")).toBe(true); // zh stays caught after tightening
  });

  // Review FP fix: PURPOSE ("để … thành công" / "to … successfully") and WELL-WISH
  // ("chúc … thành công") are NOT completion claims — blocking them would suppress
  // the model's legitimate "you need to grant permission" guidance.
  test("purpose / well-wish 'thành công' clauses → false (no false block)", () => {
    expect(assertsCompletedWrite("Để tạo sự kiện thành công, bạn cần cấp quyền Calendar.")).toBe(false);
    expect(assertsCompletedWrite("Để gửi email thành công, hãy kiểm tra địa chỉ người nhận.")).toBe(false);
    expect(assertsCompletedWrite("Chúc bạn tạo sự kiện thành công nhé!")).toBe(false);
    expect(assertsCompletedWrite("To send the email successfully, check the recipient.")).toBe(false);
    expect(assertsCompletedWrite("要成功创建事件，请先授权。")).toBe(false); // zh purpose, not completion
  });
});

describe("guardWriteClaim — block unbacked write-success claims (Rule 13)", () => {
  // THE success criterion: model says "đã tạo" but no write tool ran → blocked.
  test("confabulated success + NO write backing → blocked, safe message replaces it", () => {
    const completion = "Sự kiện 'LAAM QA test' đã được tạo thành công trên Google Calendar.";
    const r = guardWriteClaim(completion, { writeBacked: false, lang: "vi" });
    expect(r.blocked).toBe(true);
    // the false success message MUST NOT reach the user verbatim
    expect(r.text).not.toContain("đã được tạo thành công");
    expect(r.text).toBe(SAFE_UNBACKED_WRITE.vi);
  });

  // Proves the guard keys on the BACKING, not merely the words: if a real write
  // tool_result exists this turn, the same prose is legitimate and passes through.
  test("same success prose but write IS backed → NOT blocked", () => {
    const completion = "Sự kiện 'LAAM QA test' đã được tạo thành công trên Google Calendar.";
    const r = guardWriteClaim(completion, { writeBacked: true, lang: "vi" });
    expect(r.blocked).toBe(false);
    expect(r.text).toBe(completion);
  });

  test("normal read/answer text → passes through untouched", () => {
    const completion = "Đây là 3 email gần đây của bạn: …";
    const r = guardWriteClaim(completion, { writeBacked: false, lang: "vi" });
    expect(r.blocked).toBe(false);
    expect(r.text).toBe(completion);
  });

  test("future-tense (model didn't claim completion) → passes through", () => {
    const completion = "Mình sẽ tạo sự kiện đó nếu bạn xác nhận.";
    const r = guardWriteClaim(completion, { writeBacked: false, lang: "vi" });
    expect(r.blocked).toBe(false);
    expect(r.text).toBe(completion);
  });

  test("safe message is localized by lang (vi/en/zh), defaults to vi", () => {
    const completion = "The event has been created successfully.";
    expect(guardWriteClaim(completion, { writeBacked: false, lang: "en" }).text).toBe(
      SAFE_UNBACKED_WRITE.en,
    );
    expect(guardWriteClaim("已成功创建事件。", { writeBacked: false, lang: "zh" }).text).toBe(
      SAFE_UNBACKED_WRITE.zh,
    );
    // unknown / missing lang → vi fallback
    expect(guardWriteClaim(completion, { writeBacked: false }).text).toBe(SAFE_UNBACKED_WRITE.vi);
  });
});
