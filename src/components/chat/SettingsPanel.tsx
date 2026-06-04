"use client";

// Model + generation settings (presentational). Ported from v1
// public/chat-settings.js, reduced to the locked prop surface
// (model / temperature / topP / system). Controlled by the `settings` prop;
// every change emits the full next ChatSettings via onChange.

import { useT } from "@/i18n/provider";
import { chat } from "@/i18n/dictionaries/chat";
import type { ChatSettings } from "./types";

const RANGE_CLS =
  "w-full cursor-pointer accent-blue-600";
const FIELD_CLS =
  "w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-sm text-neutral-800 outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";

export function SettingsPanel({
  settings,
  models,
  onChange,
}: {
  settings: ChatSettings;
  models: string[];
  onChange(next: ChatSettings): void;
}) {
  const t = useT(chat);

  // Always offer the current model as an option even if Ollama doesn't report
  // it, so the user's choice never silently disappears.
  const list = models.includes(settings.model)
    ? models
    : [settings.model, ...models];

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
        {t("chat.setTitle")}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {t("chat.setModelLabel")}
        </span>
        <select
          aria-label={t("chat.setModelLabel")}
          value={settings.model}
          onChange={(e) => onChange({ ...settings, model: e.target.value })}
          className={FIELD_CLS}
        >
          {list.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
          <span>{t("chat.setTempLabel")}</span>
          <b className="font-semibold tabular-nums text-blue-600 dark:text-blue-400">
            {settings.temperature.toFixed(1)}
          </b>
        </span>
        <input
          type="range"
          aria-label={t("chat.setTempLabel")}
          min={0}
          max={1.5}
          step={0.1}
          value={settings.temperature}
          onChange={(e) => onChange({ ...settings, temperature: Number(e.target.value) })}
          className={RANGE_CLS}
        />
        <span className="text-[11px] text-neutral-400">{t("chat.setTempHint")}</span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
          <span>{t("chat.setToppLabel")}</span>
          <b className="font-semibold tabular-nums text-blue-600 dark:text-blue-400">
            {settings.topP.toFixed(2)}
          </b>
        </span>
        <input
          type="range"
          aria-label={t("chat.setToppLabel")}
          min={0}
          max={1}
          step={0.05}
          value={settings.topP}
          onChange={(e) => onChange({ ...settings, topP: Number(e.target.value) })}
          className={RANGE_CLS}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {t("chat.setSystemLabel")}
        </span>
        <textarea
          aria-label={t("chat.setSystemLabel")}
          rows={4}
          value={settings.system}
          placeholder={t("chat.setSystemPh")}
          onChange={(e) => onChange({ ...settings, system: e.target.value })}
          className={FIELD_CLS + " resize-y font-mono text-xs leading-relaxed"}
        />
      </label>

      <span className="text-[11px] text-neutral-400">{t("chat.setApplyNote")}</span>
    </div>
  );
}
