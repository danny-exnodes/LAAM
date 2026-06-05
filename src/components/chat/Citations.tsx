"use client";
// SP-4: footer "Nguồn: …" — tool đọc thành công đã cấp dữ liệu cho câu trả lời.
import { useT } from "@/i18n/provider";
import { chat } from "@/i18n/dictionaries/chat";
import { toolLabel } from "./toolLabel";

export function Citations({ names }: { names?: string[] }) {
  const t = useT(chat);
  if (!names || names.length === 0) return null;
  return (
    <div className="mt-1.5 text-xs text-neutral-400 dark:text-neutral-500">
      {t("chat.source")}: {names.map((n) => toolLabel(n, t)).join(" · ")}
    </div>
  );
}
