import type { ReactNode } from "react";

// A titled settings group: small uppercase label + a rounded card whose direct
// children are rows separated by dividers. Matches the app card idiom.
export function SettingsCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      {title && (
        <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {title}
        </h2>
      )}
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800">{children}</div>
      </div>
    </section>
  );
}
