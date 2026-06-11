"use client";

import { useT } from "@/i18n/provider";
import { usersDict } from "@/i18n/dictionaries/users";
import { PageHeader } from "@/components/page-header";

// i18n title for the user-management page (PageHeader takes plain strings; this
// client wrapper resolves them via the language provider).
export function UsersTitle() {
  const t = useT(usersDict);
  return <PageHeader title={t("users.title")} subtitle={t("users.subtitle")} />;
}
