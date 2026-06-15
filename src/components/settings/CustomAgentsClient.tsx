"use client";

// P3: quản lý Custom Agent presets (per-user). List + create/edit/delete +
// 3 template quick-fill (điền form, user sửa rồi mới lưu — không tự POST).
// Server state = source of truth qua API; component giữ bản sao optimistic-sau-OK.

import { useState } from "react";
import { Bot, Plus } from "lucide-react";
import { useT } from "@/i18n/provider";
import { customAgentsDict } from "@/i18n/dictionaries/customAgents";
import { PageHeader } from "@/components/page-header";

export type CustomAgentItem = {
  id: string;
  name: string;
  description: string | null;
  system: string;
};

const TEMPLATE_KEYS = ["summarizer", "triage", "writer"] as const;

const FIELD_CLS =
  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-[var(--color-accent)] dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

export function CustomAgentsClient({ initial }: { initial: CustomAgentItem[] }) {
  const t = useT(customAgentsDict);
  const [agents, setAgents] = useState<CustomAgentItem[]>(initial);
  // editingId: null = đóng form; "" = form tạo mới; id = form sửa preset đó.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [system, setSystem] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setEditingId("");
    setName("");
    setDescription("");
    setSystem("");
    setError(null);
  }

  function openEdit(a: CustomAgentItem) {
    setEditingId(a.id);
    setName(a.name);
    setDescription(a.description ?? "");
    setSystem(a.system);
    setError(null);
  }

  // Clone opens the CREATE form prefilled with a "(copy)" name + the same system, so
  // the user reviews/edits before saving (no auto-POST — mirrors fillTemplate).
  function clone(a: CustomAgentItem) {
    setEditingId("");
    setName(`${a.name} (copy)`.slice(0, 120));
    setDescription(a.description ?? "");
    setSystem(a.system);
    setError(null);
  }

  function fillTemplate(key: (typeof TEMPLATE_KEYS)[number]) {
    setName(t(`ca.tpl.${key}.name`));
    setSystem(t(`ca.tpl.${key}.system`));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (editingId === "") {
        const r = await fetch("/api/custom-agents", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: name.trim(), description: description.trim(), system: system.trim() }),
        });
        const d = (await r.json().catch(() => null)) as { ok?: boolean; agent?: CustomAgentItem } | null;
        if (!r.ok || !d?.agent) throw new Error("create failed");
        setAgents((p) => [d.agent!, ...p]);
      } else if (editingId) {
        const r = await fetch(`/api/custom-agents/${editingId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: name.trim(), description: description.trim(), system: system.trim() }),
        });
        if (!r.ok) throw new Error("update failed");
        setAgents((p) =>
          p.map((a) => (a.id === editingId ? { ...a, name: name.trim(), description: description.trim() || null, system: system.trim() } : a)),
        );
      }
      setEditingId(null);
    } catch {
      setError(t("ca.error"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(t("ca.confirmDelete"))) return;
    try {
      const r = await fetch(`/api/custom-agents/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("delete failed");
      setAgents((p) => p.filter((a) => a.id !== id));
    } catch {
      setError(t("ca.error"));
    }
  }

  const formOpen = editingId !== null;
  const saveDisabled = busy || !name.trim() || !system.trim();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("ca.title")} subtitle={t("ca.subtitle")} />

      {!formOpen && (
        <button
          type="button"
          onClick={openCreate}
          className="mb-4 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          <Plus size={15} aria-hidden />
          {t("ca.create")}
        </button>
      )}

      {formOpen && (
        <div className="mb-4 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-neutral-400">{t("ca.templates")}</span>
            {TEMPLATE_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => fillTemplate(k)}
                className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs text-neutral-600 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              >
                {t(`ca.tpl.${k}.name`)}
              </button>
            ))}
          </div>
          <label className="mb-1 block text-xs font-semibold text-neutral-500" htmlFor="ca-name">
            {t("ca.nameLabel")}
          </label>
          <input id="ca-name" className={FIELD_CLS} value={name} placeholder={t("ca.namePh")} onChange={(e) => setName(e.target.value)} />
          <label className="mb-1 mt-3 block text-xs font-semibold text-neutral-500" htmlFor="ca-desc">
            {t("ca.descLabel")}
          </label>
          <input id="ca-desc" className={FIELD_CLS} value={description} onChange={(e) => setDescription(e.target.value)} />
          <label className="mb-1 mt-3 block text-xs font-semibold text-neutral-500" htmlFor="ca-system">
            {t("ca.systemLabel")}
          </label>
          <textarea
            id="ca-system"
            className={FIELD_CLS}
            rows={5}
            value={system}
            placeholder={t("ca.systemPh")}
            onChange={(e) => setSystem(e.target.value)}
          />
          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={saveDisabled}
              onClick={() => void save()}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("ca.save")}
            </button>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="rounded-lg px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              {t("ca.cancel")}
            </button>
          </div>
        </div>
      )}

      {agents.length === 0 && !formOpen && <p className="text-sm text-neutral-400">{t("ca.empty")}</p>}

      <ul className="flex flex-col gap-2">
        {agents.map((a) => (
          <li
            key={a.id}
            className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <span className="mt-0.5 shrink-0 text-[var(--color-accent)]" aria-hidden>
              <Bot size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-neutral-800 dark:text-neutral-100">{a.name}</div>
              {a.description && <div className="truncate text-xs text-neutral-500">{a.description}</div>}
              <div className="mt-1 line-clamp-2 text-xs text-neutral-400">{a.system}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <a
                href={`/chat?agent=${a.id}`}
                className="rounded-lg px-2 py-1 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10"
              >
                {t("ca.useInChat")}
              </a>
              <button
                type="button"
                onClick={() => clone(a)}
                className="rounded-lg px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                {t("ca.clone")}
              </button>
              <button
                type="button"
                onClick={() => openEdit(a)}
                className="rounded-lg px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                {t("ca.edit")}
              </button>
              <button
                type="button"
                onClick={() => void remove(a.id)}
                className="rounded-lg px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
              >
                {t("ca.delete")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
