// Shown by Next while a route segment loads (server work / first-visit compile
// in dev), so navigating shows motion instead of a frozen screen.
export default function Loading() {
  return (
    <div role="status" aria-label="Đang tải…" className="fixed inset-x-0 top-0 z-[60]">
      <div className="h-0.5 w-full overflow-hidden bg-[var(--color-accent)]/10">
        <div className="laam-bar h-full w-1/3 rounded-full bg-[var(--color-accent)]" />
      </div>
    </div>
  );
}
