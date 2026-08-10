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
  claudeModels = [],
  byteplusModels = [],
  cerebrasModels = [],
  customAgents = [],
  onChange,
}: {
  settings: ChatSettings;
  models: string[];
  /** C2: Claude API model whitelist from /api/chat/info. Empty = no Claude optgroup. */
  claudeModels?: string[];
  /** BytePlus model whitelist from /api/chat/info. Empty = no BytePlus optgroup. */
  byteplusModels?: string[];
  /** Cerebras model whitelist from /api/chat/info. Empty = no Cerebras optgroup. */
  cerebrasModels?: string[];
  /** P3 chat persona: user's saved custom agents (id+name). Empty = no persona select. */
  customAgents?: { id: string; name: string }[];
  onChange(next: ChatSettings): void;
}) {
  const t = useT(chat);

  // Always offer the current model as an option even if Ollama doesn't report
  // it, so the user's choice never silently disappears. filter(Boolean) drops the
  // empty initial model (before /api/chat/info loads) so there's no blank option.
  const list = (models.includes(settings.model) ? models : [settings.model, ...models]).filter(
    Boolean,
  );

  // C2: when any cloud-provider whitelist is non-empty, split the <select> into
  // optgroups. When all are empty, render the flat list exactly as before (tests
  // pass unchanged). Each cloud optgroup renders only when it has entries.
  const hasGroups = claudeModels.length > 0 || byteplusModels.length > 0 || cerebrasModels.length > 0;
  // Ollama list: exclude any cloud models that somehow appear in the Ollama list.
  const ollamaList = hasGroups
    ? list.filter((m) => !claudeModels.includes(m) && !byteplusModels.includes(m) && !cerebrasModels.includes(m))
    : list;

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
          {hasGroups ? (
            <>
              <optgroup label={t("chat.grpLocal")}>
                {ollamaList.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </optgroup>
              {claudeModels.length > 0 && (
                <optgroup label={t("chat.grpClaude")}>
                  {claudeModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </optgroup>
              )}
              {byteplusModels.length > 0 && (
                <optgroup label={t("chat.grpByteplus")}>
                  {byteplusModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </optgroup>
              )}
              {cerebrasModels.length > 0 && (
                <optgroup label={t("chat.grpCerebras")}>
                  {cerebrasModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </optgroup>
              )}
            </>
          ) : (
            list.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))
          )}
        </select>
      </label>

      {customAgents.length > 0 && (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {t("chat.setAgentLabel")}
          </span>
          <select
            aria-label={t("chat.setAgentLabel")}
            value={settings.customAgentId ?? ""}
            onChange={(e) => onChange({ ...settings, customAgentId: e.target.value || undefined })}
            className={FIELD_CLS}
          >
            <option value="">{t("chat.agentDefault")}</option>
            {customAgents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <span className="text-[11px] text-neutral-400">{t("chat.setAgentHint")}</span>
        </label>
      )}

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
