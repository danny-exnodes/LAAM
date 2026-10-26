// When a table is already on screen, tell the model so it stops typing that table out again.
//
// WHY: measured 2026-08-07 in the demo UI on the receipt for TXN-0004917. The model wrote out
// the six line items itself and printed a unit price of "$1022" for a value that is 10.22 — a
// hundredfold error on a receipt — while the code-built table directly below carried the right
// number. Retyping rows is where transcription errors come from; the same failure produced
// "PH-1" for "PH-001" in an earlier run (see digest.ts).
//
// The instruction already existed, but only inside digest.ts, which runs at >=6000 chars AND
// >=10 rows. The panel shows from 3 rows. Everything in between got a panel and no
// instruction, and most demo answers land in that gap. Tying the note to whether a panel was
// ACTUALLY emitted removes the gap by construction — there is no threshold left to disagree on.
//
// It also costs nothing: not retyping a table is fewer output tokens, and output decode is
// where this assistant's latency lives.
//
// PURE — no I/O, no model calls (Rule 5).
import type { ViewDescriptor } from "./view";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

function panelNote(view: ViewDescriptor): string {
  const shown = view.rows?.length ?? 0;
  const total = view.truncated?.total;
  const what =
    total && total > shown
      ? `một bảng ${shown}/${total} dòng (bảng chỉ hiện ${shown} dòng đầu — tổng thật là ${total})`
      : `một bảng ${shown} dòng ĐẦY ĐỦ`;
  return (
    `Người dùng ĐANG NHÌN THẤY ${what} do hệ thống dựng sẵn ngay dưới câu trả lời của bạn. ` +
    "ĐỪNG chép lại bảng đó bằng tay — chỉ nêu nhận định và số tổng hợp. " +
    "Chép tay từng ô là nơi sinh ra lỗi gõ: đã đo được một đơn giá 10.22 bị in thành 1022."
  );
}

// Attach the note to a result whose rows are already on screen. Returns the result UNCHANGED
// when no panel was shown, when it is already digested (digest.ts carries its own version of
// this instruction, computed over the full result — two notes would put two different row
// counts in front of the model), or when the shape is not one we can add a field to.
export function annotatePanelShown(result: unknown, view: ViewDescriptor | null): unknown {
  if (!view || !isRecord(result)) return result;
  if (result._digest === true) return result;
  return { ...result, panel_note: panelNote(view) };
}
