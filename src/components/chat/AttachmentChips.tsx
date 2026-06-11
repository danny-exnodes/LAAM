import { File, FileText, ImageIcon, Link2 } from "lucide-react";
import type { AttachmentMeta } from "@/lib/chat/attachment-meta";

// Human-readable byte size for an attachment chip (locale-neutral).
export function formatBytes(n?: number): string {
  if (!n || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function KindIcon({ kind, mime }: { kind: string; mime?: string }) {
  const cls = "h-5 w-5 text-neutral-400";
  if (kind === "image") return <ImageIcon className={cls} aria-hidden />;
  if (kind === "url") return <Link2 className={cls} aria-hidden />;
  if (mime === "application/pdf") return <FileText className={cls} aria-hidden />;
  return <File className={cls} aria-hidden />;
}

// One attachment as a thumbnail-or-icon card with name + size. Read-only — the
// composer wraps it with a remove button. `preview` is a small data-URL thumbnail
// (image / PDF first page); absent → a kind icon. Used in the message bubble (so a
// reloaded message shows WHAT was attached) and the composer's pending chips.
export function AttachmentPreview({
  att,
}: {
  att: Pick<AttachmentMeta, "name" | "kind" | "mime" | "size" | "preview">;
}) {
  return (
    <span className="inline-flex max-w-[200px] items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-900">
      {att.preview ? (
        // Data-URL thumbnail — a plain <img> is correct here (next/image can't
        // optimize data URLs).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={att.preview} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
      ) : (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-neutral-100 dark:bg-neutral-800">
          <KindIcon kind={att.kind} mime={att.mime} />
        </span>
      )}
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-xs text-neutral-700 dark:text-neutral-200">{att.name}</span>
        {formatBytes(att.size) && (
          <span className="text-[10px] text-neutral-400">{formatBytes(att.size)}</span>
        )}
      </span>
    </span>
  );
}
