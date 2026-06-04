"use client";

// Language selector (vi/en/zh). useLang().setLang updates the in-house i18n
// provider (live re-render of client text + writes the laam_lang cookie);
// router.refresh re-renders any server components in the new language.

import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { useLang } from "@/i18n/provider";
import type { Lang } from "@/i18n/types";

const LANGS: { code: Lang; label: string }[] = [
  { code: "vi", label: "Tiếng Việt" },
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
];

export function LangSelect() {
  const { lang, setLang } = useLang();
  const router = useRouter();
  return (
    <div className="relative inline-flex items-center">
      <Languages
        size={15}
        className="pointer-events-none absolute left-2 text-neutral-400"
        aria-hidden
      />
      <select
        aria-label="Ngôn ngữ"
        value={lang}
        onChange={(e) => {
          setLang(e.target.value as Lang);
          router.refresh();
        }}
        className="appearance-none rounded-lg border border-neutral-300 bg-transparent py-1.5 pr-2 pl-7 text-sm text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
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
