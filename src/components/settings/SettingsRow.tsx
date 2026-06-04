import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

// A settings row. With `href` it is a navigation row (tinted icon + label + sub +
// chevron). Otherwise it is a control row: `right` holds the control (e.g. a
// theme toggle). `color` tints the leading icon chip (hex literal; 1a = ~10% bg).
export function SettingsRow({
  icon,
  label,
  sub,
  href,
  right,
  color = "#6d5efc",
}: {
  icon: ReactNode;
  label: string;
  sub?: string;
  href?: string;
  right?: ReactNode;
  color?: string;
}) {
  const body = (
    <>
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
        style={{ backgroundColor: color + "1a", color }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
          {label}
        </span>
        {sub && (
          <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
            {sub}
          </span>
        )}
      </span>
      {href ? (
        <ChevronRight size={18} className="shrink-0 text-neutral-400" aria-hidden />
      ) : (
        right
      )}
    </>
  );
  const cls = "flex items-center gap-3 px-4 py-3";
  return href ? (
    <Link href={href} className={cls + " transition hover:bg-neutral-50 dark:hover:bg-neutral-800/50"}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
