// Persisted attachment preview metadata — SINGLE SOURCE OF TRUTH shared by the DB
// schema (chat_message.attachments), the chat API (/api/chat persist + load), and
// the client (ChatClient send + ChatMsg render). Lets a reloaded message show WHAT
// was attached (thumbnail + name/size), not just the prepended text in `content`.
export type AttachmentMeta = {
  name: string;
  kind: "file" | "image" | "url";
  mime?: string;
  size?: number; // original byte size
  preview?: string; // data URL thumbnail (image / PDF first page); absent for plain files/URLs
};

export const MAX_ATTACHMENTS = 8; // cap persisted/rendered per message
export const MAX_PREVIEW_CHARS = 200_000; // ~150KB data URL thumb — DB hygiene cap

// Coerce arbitrary request input into a safe AttachmentMeta[] for persistence:
// keep only well-formed entries, cap count, drop oversized previews. Pure —
// unit-testable, and the trust boundary for body.attachments (never persist raw).
export function sanitizeAttachments(input: unknown): AttachmentMeta[] {
  if (!Array.isArray(input)) return [];
  const out: AttachmentMeta[] = [];
  for (const a of input) {
    if (out.length >= MAX_ATTACHMENTS) break;
    if (!a || typeof a !== "object") continue;
    const o = a as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.slice(0, 300) : "";
    const kind = o.kind === "image" || o.kind === "url" ? o.kind : "file";
    if (!name) continue;
    const meta: AttachmentMeta = { name, kind };
    if (typeof o.mime === "string") meta.mime = o.mime.slice(0, 100);
    if (typeof o.size === "number" && Number.isFinite(o.size)) meta.size = Math.max(0, Math.floor(o.size));
    if (typeof o.preview === "string" && o.preview.startsWith("data:") && o.preview.length <= MAX_PREVIEW_CHARS) {
      meta.preview = o.preview;
    }
    out.push(meta);
  }
  return out;
}
