"use client";

// Header avatar (replaces the old hamburger). Shows the Gravatar image with a
// role badge — a tilted gold crown for owner, a straw hat for everyone else —
// and a small dropdown with the account name/role + sign out.

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Crown, LogOut } from "lucide-react";
import { useT } from "@/i18n/provider";
import { common } from "@/i18n/dictionaries/common";

export function UserAvatar({
  avatarUrl,
  role,
  name,
}: {
  avatarUrl: string;
  role?: string;
  name?: string | null;
}) {
  const t = useT(common);
  const [open, setOpen] = useState(false);
  const isOwner = role === "owner";

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("account.label")}
        aria-expanded={open}
        className="relative block h-9 w-9 rounded-full"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl}
          alt={name ?? "avatar"}
          width={36}
          height={36}
          className="h-9 w-9 rounded-full bg-neutral-200 object-cover ring-1 ring-neutral-300 dark:bg-neutral-700 dark:ring-neutral-600"
        />
        <span className="absolute -top-2 -right-1.5 leading-none" aria-hidden>
          {isOwner ? (
            <Crown size={15} className="rotate-45 fill-amber-400 text-amber-500 drop-shadow-sm" />
          ) : (
            <span className="text-[13px]">👒</span>
          )}
        </span>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="anim-scale-in absolute top-11 right-0 z-50 w-48 overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
            <div className="px-3 py-2">
              <div className="truncate text-sm font-medium text-neutral-700 dark:text-neutral-200">
                {name ?? t("account.label")}
              </div>
              <div className="flex items-center gap-1 text-xs text-neutral-500 capitalize">
                {isOwner && <Crown size={11} className="fill-amber-400 text-amber-500" />}
                {role ?? "member"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-700 transition hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              <LogOut size={15} aria-hidden /> {t("account.signOut")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
