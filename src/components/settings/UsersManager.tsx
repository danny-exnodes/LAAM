"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/provider";
import { usersDict } from "@/i18n/dictionaries/users";
import { UserKeysPanel } from "./UserKeysPanel";

type Row = {
  id: string;
  name: string | null;
  email: string | null;
  role: "owner" | "admin" | "member" | "viewer";
  disabledAt: string | null;
  createdAt: string | null;
};

const ROLES = ["owner", "admin", "member", "viewer"] as const;

export function UsersManager({
  initial,
  currentUserId,
  isOwner,
}: {
  initial: Row[];
  currentUserId: string;
  isOwner: boolean;
}) {
  const t = useT(usersDict);
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [openKeysId, setOpenKeysId] = useState<string | null>(null);
  // Resolve a key's createdByUserId → display name (the provisioning admin).
  const nameById = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.id, r.name ?? r.email ?? r.id])),
    [rows],
  );

  function flash(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3000);
  }

  async function patch(id: string, body: Record<string, unknown>, okMsg: string) {
    setBusyId(id);
    // optimistic snapshot for rollback
    const prev = rows;
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRows(prev); // rollback
        flash(false, data.error ?? t("users.err.generic"));
        return;
      }
      flash(true, okMsg);
      router.refresh();
    } catch {
      setRows(prev);
      flash(false, t("users.err.generic"));
    } finally {
      setBusyId(null);
    }
  }

  function changeRole(id: string, role: string) {
    setRows((r) => r.map((u) => (u.id === id ? { ...u, role: role as Row["role"] } : u)));
    void patch(id, { role }, t("users.ok.role"));
  }

  function toggleDisabled(u: Row) {
    const disabling = !u.disabledAt;
    const name = u.name ?? u.email ?? u.id;
    const confirmMsg = disabling
      ? t("users.confirmDisable", { name })
      : t("users.confirmEnable", { name });
    if (typeof window !== "undefined" && !window.confirm(confirmMsg)) return;
    setRows((r) =>
      r.map((x) => (x.id === u.id ? { ...x, disabledAt: disabling ? new Date().toISOString() : null } : x)),
    );
    void patch(
      u.id,
      { disabled: disabling },
      disabling ? t("users.ok.disabled") : t("users.ok.enabled"),
    );
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div
          role="status"
          className={
            "rounded-lg px-4 py-2 text-sm " +
            (toast.ok
              ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300"
              : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300")
          }
        >
          {toast.msg}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-neutral-500">{t("users.empty")}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
                <th className="px-4 py-3 font-semibold">{t("users.col.name")}</th>
                <th className="px-4 py-3 font-semibold">{t("users.col.role")}</th>
                <th className="px-4 py-3 font-semibold">{t("users.col.status")}</th>
                <th className="px-4 py-3 font-semibold text-right">{t("users.col.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {rows.map((u) => {
                const isSelf = u.id === currentUserId;
                const disabled = !!u.disabledAt;
                const keysOpen = openKeysId === u.id;
                return (
                  <Fragment key={u.id}>
                  <tr className={disabled ? "opacity-60" : undefined}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-neutral-800 dark:text-neutral-100">
                        {u.name ?? "—"} {isSelf && <span className="text-xs text-neutral-400">{t("users.you")}</span>}
                      </div>
                      <div className="text-xs text-neutral-500">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      {isOwner && !isSelf ? (
                        <select
                          value={u.role}
                          disabled={busyId === u.id}
                          onChange={(e) => changeRole(u.id, e.target.value)}
                          className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-950"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {t(`users.role.${r}`)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          title={!isOwner ? t("users.roleOnlyOwner") : undefined}
                          className="inline-flex items-center rounded-full bg-[var(--color-accent)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-accent)]"
                        >
                          {t(`users.role.${u.role}`)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {disabled ? (
                        <span className="text-xs font-medium text-red-600 dark:text-red-400">
                          {t("users.status.disabled")}
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-green-600 dark:text-green-400">
                          {t("users.status.active")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setOpenKeysId(keysOpen ? null : u.id)}
                          aria-expanded={keysOpen}
                          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                        >
                          {keysOpen ? t("users.keys.hide") : t("users.keys.expand")}
                        </button>
                        {!isSelf && (
                          <button
                            onClick={() => toggleDisabled(u)}
                            disabled={busyId === u.id}
                            className={
                              "rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 " +
                              (disabled
                                ? "border-neutral-300 text-green-600 hover:bg-green-50 dark:border-neutral-700 dark:hover:bg-green-950/40"
                                : "border-neutral-300 text-red-600 hover:bg-red-50 dark:border-neutral-700 dark:hover:bg-red-950/40")
                            }
                          >
                            {disabled ? t("users.enable") : t("users.disable")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {keysOpen && (
                    <tr>
                      <td colSpan={4} className="bg-neutral-50/50 px-4 py-3 dark:bg-neutral-950/40">
                        <UserKeysPanel
                          userId={u.id}
                          userName={u.name ?? u.email ?? u.id}
                          isSelf={isSelf}
                          nameById={nameById}
                        />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
