"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { useT } from "@/i18n/provider";
import { authDict } from "@/i18n/dictionaries/auth";

export default function RegisterPage() {
  const t = useT(authDict);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        email: fd.get("email"),
        password: fd.get("password"),
        // REGISTER_MODE=invite: server enforces; empty string → omit so zod optional passes
        inviteCode: fd.get("inviteCode") || undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t("auth.register.err"));
      return;
    }
    router.push("/login");
  }

  return (
    <AuthShell>
      <div className="anim-scale-in rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="text-xl font-bold tracking-tight">{t("auth.register.title")}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t("auth.register.sub")}</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Field label={t("auth.name")} name="name" type="text" autoComplete="name" />
          <Field label={t("auth.email")} name="email" type="email" autoComplete="email" />
          <Field
            label={t("auth.register.passwordMin")}
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
          />
          <div>
            <Field label={t("auth.register.invite")} name="inviteCode" type="text" required={false} />
            <p className="mt-1 text-xs text-neutral-500">{t("auth.register.inviteHint")}</p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? t("auth.register.submitting") : t("auth.register.submit")}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-neutral-500">
          {t("auth.register.haveAccount")}{" "}
          <Link href="/login" className="font-medium text-[var(--color-accent)] hover:underline">
            {t("auth.register.loginLink")}
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}

function Field(props: {
  label: string;
  name: string;
  type: string;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{props.label}</span>
      <input
        required={props.required ?? true}
        name={props.name}
        type={props.type}
        autoComplete={props.autoComplete}
        minLength={props.minLength}
        className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] dark:border-neutral-700 dark:bg-neutral-950"
      />
    </label>
  );
}
