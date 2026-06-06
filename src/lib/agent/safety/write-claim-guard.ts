// F1 safety net (Rule 13): the local model sometimes NARRATES a write as done
// ("Sự kiện … đã được tạo thành công") WITHOUT emitting the tool_call. In the chat
// main turn a real write ALWAYS suspends (PendingWriteSignal) before it can run, so
// any "write succeeded" claim that reaches the streamed completion is provably
// false. These pure helpers let the route detect write-intent (→ buffer the turn)
// and replace an unbacked success claim with an honest message. Tri-lingual
// (vi/en/zh) to match the chat i18n surface.
//
// Heuristics, not parsing: a false positive only costs token-streaming on that one
// turn (the text is still delivered, just buffered); a false negative falls back to
// the old behaviour. We therefore bias toward catching confabulations (recall).

// Lowercase up front: JS `\b` / `i`-flag case-folding are unreliable around
// Vietnamese diacritics, but `toLowerCase()` folds them correctly.
const lc = (s: string) => (s ?? "").toLowerCase();

// --- Write INTENT in the USER message (decides whether to buffer the turn). ---
// Vietnamese is space-delimited but `\b` is ASCII-only → match verb tokens directly.
const VI_INTENT =
  /(tạo|gửi|x[oó][áa]|cập\s*nhật|thêm|đặt\s*lịch|lên\s*lịch|sửa|đổi\s*tên|di\s*chuyển|chia\s*sẻ|lưu|soạn|h[uủ][ỷy])/;
const EN_INTENT =
  /\b(create|send|delete|update|add|schedule|remove|share|cancel|rename|save|draft|book|upload)\b/;
const ZH_INTENT =
  /(创建|建立|新建|发送|删除|更新|添加|安排|保存|修改|移动|分享|上传|取消|重命名)/;

export function looksLikeWriteIntent(text: string): boolean {
  const t = lc(text);
  if (!t.trim()) return false;
  return VI_INTENT.test(t) || EN_INTENT.test(t) || ZH_INTENT.test(t);
}

// --- Completed-WRITE assertion in the ASSISTANT reply (the thing to block). ---
// Every form anchors on a COMPLETION marker, never a bare verb, so PURPOSE
// ("để/to <verb> … thành công/successfully") and WELL-WISH ("chúc … thành công")
// clauses — which are NOT completion claims — do not match (would wrongly suppress
// the model's "you need to grant permission" guidance).
const VI_VERB = "(tạo|gửi|x[oó][áa]|cập\\s*nhật|thêm|đặt|lên\\s*lịch|sửa|đổi\\s*tên|di\\s*chuyển|chia\\s*sẻ|lưu|soạn|h[uủ][ỷy])";
// Perfective markers đã / vừa (optionally "mới"/"được") + verb → completed action.
const VI_DONE = new RegExp(`(đã|vừa)\\s+(mới\\s+)?(được\\s+)?${VI_VERB}`);
// Passive result "được <verb> … thành công" (completion without "đã"); the "được"
// marker is required so "để <verb> … thành công" (purpose) does not match.
const VI_SUCCESS = new RegExp(`được\\s+${VI_VERB}[^.!?\\n]{0,40}thành\\s*công`);
// Post-verbal "rồi" (done already), anchored to a sentence-final particle/punctuation
// so the sequencing sense ("…rồi <verb>" = "then …") doesn't false-match.
const VI_ROI = new RegExp(`${VI_VERB}[^.!?\\n]{0,30}rồi\\s*(nhé|nha|nhá|ạ|!|\\.|,|$)`);
// EN: perfect tense ("has been created", "I've sent") or "successfully <verb>" /
// "<verb> … successfully". EN verbs are PAST tense, so future/purpose using the base
// form ("to send … successfully") naturally does not match.
const EN_VERB = "(created|sent|deleted|updated|added|scheduled|removed|saved|shared|cancell?ed|renamed|moved|posted|booked|uploaded)";
const EN_DONE = new RegExp(`(?:\\b(?:have|has|had)\\b|['’]ve)\\s+(?:been\\s+)?${EN_VERB}\\b`);
const EN_SUCCESS = new RegExp(`(?:\\bsuccessfully\\s+${EN_VERB}\\b|\\b${EN_VERB}\\b[^.!?\\n]{0,30}\\bsuccessfully\\b)`);
// ZH: real completion marker 已/已经 (optionally + 成功) + verb, or "<verb> 成功/完成".
// Bare "成功<verb>" is dropped so PURPOSE "要成功创建…" does not match; "创建成功"
// stays caught via ZH_SUCCESS.
const ZH_VERB = "(创建|建立|新建|发送|删除|更新|添加|安排|保存|修改|移动|分享|上传)";
const ZH_DONE = new RegExp(`(已经|已)(\\s*成功)?\\s*${ZH_VERB}`);
const ZH_SUCCESS = new RegExp(`${ZH_VERB}\\s*(成功|完成)`);

export function assertsCompletedWrite(text: string): boolean {
  const t = lc(text);
  if (!t.trim()) return false;
  return (
    VI_DONE.test(t) ||
    VI_SUCCESS.test(t) ||
    VI_ROI.test(t) ||
    EN_DONE.test(t) ||
    EN_SUCCESS.test(t) ||
    ZH_DONE.test(t) ||
    ZH_SUCCESS.test(t)
  );
}

// Honest replacement shown when the model claimed a write that never happened.
export const SAFE_UNBACKED_WRITE = {
  vi: "⚠️ Mình **chưa** thực hiện được hành động này — hệ thống chưa gọi công cụ ghi tương ứng, nên chưa có gì được tạo/gửi/thay đổi. Bạn thử lại hoặc nêu rõ hơn nhé.",
  en: "⚠️ I did **not** actually perform this action — no write tool was called, so nothing was created/sent/changed. Please try again or rephrase.",
  zh: "⚠️ 我**没有**真正执行此操作——系统未调用相应的写入工具，因此没有创建/发送/更改任何内容。请重试或换种说法。",
} as const;

// Core guard. `writeBacked` = a real write tool_result exists this turn. When false
// and the completion asserts a completed write, the claim is unbacked → block it.
export function guardWriteClaim(
  completion: string,
  opts: { writeBacked: boolean; lang?: string },
): { text: string; blocked: boolean } {
  if (opts.writeBacked) return { text: completion, blocked: false };
  if (!assertsCompletedWrite(completion)) return { text: completion, blocked: false };
  const lang =
    opts.lang && opts.lang in SAFE_UNBACKED_WRITE
      ? (opts.lang as keyof typeof SAFE_UNBACKED_WRITE)
      : "vi";
  return { text: SAFE_UNBACKED_WRITE[lang], blocked: true };
}
