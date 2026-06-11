"use client";

import { useT } from "@/i18n/provider";
import { accessDict } from "@/i18n/dictionaries/access";
import { PageHeader } from "@/components/page-header";

// i18n title for the self-service access-tokens page.
export function AccessTitle() {
  const t = useT(accessDict);
  return <PageHeader title={t("access.title")} subtitle={t("access.subtitle")} />;
}
