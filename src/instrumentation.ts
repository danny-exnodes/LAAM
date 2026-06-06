// Next.js 16 runs register() once when the server process starts. We use it for
// single-machine workflow crash recovery: any run left 'running' at boot was orphaned by
// the crash, so mark it 'resumable' (the tick poke then claims + resumes it). Guarded to the
// Node runtime and wrapped so a DB hiccup never blocks boot. (P0a — see orphan-sweep.ts.)
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { db } = await import("@/db");
    const { sweepOrphanedRuns } = await import("@/lib/workflow/orphan-sweep");
    const n = await sweepOrphanedRuns(db);
    if (n > 0) console.warn(`[workflow] boot: marked ${n} orphaned run(s) resumable`);
  } catch (e) {
    console.error("[workflow] boot orphan-sweep failed (non-fatal):", e);
  }
}
