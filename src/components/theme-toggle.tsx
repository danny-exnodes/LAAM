"use client";

// Theme toggle — cycles system → light → dark. Persists to localStorage
// ("laam_theme") and toggles the `.dark` class on <html>. The matching no-flash
// script in app/layout.tsx applies the saved theme before first paint.

import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { useT } from "@/i18n/provider";
import { common } from "@/i18n/dictionaries/common";

type Theme = "system" | "light" | "dark";
export const THEME_KEY = "laam_theme";
const ORDER: Theme[] = ["system", "light", "dark"];
const ICON = { system: Monitor, light: Sun, dark: Moon } as const;
const LABEL_KEY = { system: "theme.system", light: "theme.light", dark: "theme.dark" } as const;

function systemDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function apply(theme: Theme): void {
  const dark = theme === "dark" || (theme === "system" && systemDark());
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle() {
  const t = useT(common);
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const saved = (localStorage.getItem(THEME_KEY) as Theme) || "system";
    setTheme(saved);
    apply(saved);
    // Keep "system" mode in sync with OS changes.
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSys = () => {
      if (((localStorage.getItem(THEME_KEY) as Theme) || "system") === "system") apply("system");
    };
    mq.addEventListener("change", onSys);
    return () => mq.removeEventListener("change", onSys);
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
    apply(next);
  }

  const Icon = ICON[theme];
  const label = t("theme.current", { state: t(LABEL_KEY[theme]) });
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-neutral-300 text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
    >
      <Icon size={16} aria-hidden />
    </button>
  );
}
