"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
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
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Đăng ký thất bại.");
      return;
    }
    router.push("/login");
  }

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="text-lg font-bold tracking-tight">Tạo tài khoản</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Người đăng ký đầu tiên sẽ là <b>owner</b>.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Field label="Tên" name="name" type="text" autoComplete="name" />
          <Field label="Email" name="email" type="email" autoComplete="email" />
          <Field
            label="Mật khẩu (≥ 8 ký tự)"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Đang tạo…" : "Đăng ký"}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-neutral-500">
          Đã có tài khoản?{" "}
          <Link href="/login" className="font-medium text-[var(--color-accent)] hover:underline">
            Đăng nhập
          </Link>
        </p>
      </div>
    </main>
  );
}

function Field(props: {
  label: string;
  name: string;
  type: string;
  autoComplete?: string;
  minLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{props.label}</span>
      <input
        required
        name={props.name}
        type={props.type}
        autoComplete={props.autoComplete}
        minLength={props.minLength}
        className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] dark:border-neutral-700 dark:bg-neutral-950"
      />
    </label>
  );
}
