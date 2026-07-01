import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { LANG_COOKIE } from "@/i18n/cookie";
import type { Lang } from "@/i18n/types";
import { ConstellationClient } from "@/components/constellation/ConstellationClient";

export const dynamic = "force-dynamic";

const SUPPORTED: readonly string[] = ["vi", "en", "zh"];

export default async function ConstellationPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const raw = (await cookies()).get(LANG_COOKIE)?.value;
  const lang: Lang = raw && SUPPORTED.includes(raw) ? (raw as Lang) : "vi";
  return <ConstellationClient greetingName={session.user.name ?? ""} lang={lang} />;
}
