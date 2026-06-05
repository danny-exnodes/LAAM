"use client";

// Language selector (vi/en/zh). useLang().setLang updates the in-house i18n
// provider (live re-render of client text + writes the laam_lang cookie);
// router.refresh re-renders any server components in the new language.

import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { useLang, useT } from "@/i18n/provider";
import { common } from "@/i18n/dictionaries/common";
import type { Lang } from "@/i18n/types";

// Abbreviated codes keep the header compact (icon + short text).
const LANGS: { code: Lang; label: string }[] = [
  { code: "vi", label: "VI" },
  { code: "en", label: "EN" },
  { code: "zh", label: "中" },
];

export function LangSelect() {
  const { lang, setLang } = useLang();
  const t = useT(common);
  const router = useRouter();
  return (
    <div className="relative inline-flex items-center">
      <Languages
        size={15}
        className="pointer-events-none absolute left-2 text-neutral-400"
        aria-hidden
      />
      <select
        aria-label={t("lang.label")}
        value={lang}
        onChange={(e) => {
          setLang(e.target.value as Lang);
          router.refresh();
        }}
        className="h-9 appearance-none rounded-lg border border-neutral-300 bg-transparent pr-2 pl-7 text-sm text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </div>
  );
}
