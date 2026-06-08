"use client";

import { Server, Palette, Languages, Gauge } from "lucide-react";
import { useT } from "@/i18n/provider";
import { settingsDict } from "@/i18n/dictionaries/settings";
import { ThemeToggle } from "@/components/theme-toggle";
import { LangSelect } from "@/components/lang-select";
import { SettingsCard } from "./SettingsCard";
import { SettingsRow } from "./SettingsRow";
import { SignOutButton } from "./SignOutButton";

interface SettingsUser {
  name: string | null;
  email: string | null;
  role?: string;
  avatarUrl: string;
}

// Mobile-first settings menu. Account card + grouped rows; reuses the existing
// ThemeToggle / LangSelect controls. i18n via settingsDict (re-renders on lang change).
export function SettingsMenu({ user }: { user: SettingsUser }) {
  const t = useT(settingsDict);
  return (
    <div className="mx-auto max-w-2xl">
      <SettingsCard title={t("settings.account")}>
        <div className="flex items-center gap-3 px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={user.avatarUrl}
            alt={user.name ?? "avatar"}
            width={48}
            height={48}
            className="h-12 w-12 rounded-full bg-neutral-200 object-cover ring-1 ring-neutral-300 dark:bg-neutral-700 dark:ring-neutral-600"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-neutral-800 dark:text-neutral-100">
              {user.name ?? "—"}
            </div>
            <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">{user.email}</div>
            <div className="mt-0.5 inline-flex items-center rounded-full bg-[var(--color-accent)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--color-accent)] capitalize">
              {user.role ?? "member"}
            </div>
          </div>
          <SignOutButton label={t("settings.logout")} />
        </div>
      </SettingsCard>

      <SettingsCard title={t("settings.servers")}>
        <SettingsRow
          href="/settings/machines"
          icon={<Server size={18} />}
          label={t("settings.machines.label")}
          sub={t("settings.machines.desc")}
        />
        <SettingsRow
          href="/eval"
          icon={<Gauge size={18} />}
          label={t("settings.reliability.label")}
          sub={t("settings.reliability.desc")}
          color="#16a34a"
        />
      </SettingsCard>

      <SettingsCard title={t("settings.display")}>
        <SettingsRow
          icon={<Palette size={18} />}
          label={t("settings.appearance")}
          right={<ThemeToggle />}
          color="#2dd4bf"
        />
        <SettingsRow
          icon={<Languages size={18} />}
          label={t("settings.language")}
          right={<LangSelect />}
          color="#22d3ee"
        />
      </SettingsCard>
    </div>
  );
}
