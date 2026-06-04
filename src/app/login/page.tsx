"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
      redirect: false,
    });
    setLoading(false);
    if (!res || res.error) {
      setError("Email hoặc mật khẩu không đúng.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <AuthShell>
      <div className="anim-scale-in rounded-2xl border border-neutral-200 bg-white/80 p-7 shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/70">
        <h1 className="text-xl font-bold tracking-tight">Đăng nhập</h1>
        <p className="mt-1 text-sm text-neutral-500">Chào mừng trở lại — đăng nhập để tiếp tục.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Field label="Email" name="email" type="email" autoComplete="email" />
          <Field
            label="Mật khẩu"
            name="password"
            type="password"
            autoComplete="current-password"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Đang đăng nhập…" : "Đăng nhập"}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-neutral-500">
          Chưa có tài khoản?{" "}
          <Link href="/register" className="font-medium text-[var(--color-accent)] hover:underline">
            Đăng ký
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
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{props.label}</span>
      <input
        required
        name={props.name}
        type={props.type}
        autoComplete={props.autoComplete}
        className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] dark:border-neutral-700 dark:bg-neutral-950"
      />
    </label>
  );
}
