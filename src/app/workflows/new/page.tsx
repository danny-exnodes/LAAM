"use client";

/**
 * /workflows/new — Client Component that POSTs to create a workflow then redirects.
 *
 * Previously this was a Server Component that ran db.insert() on GET — a side-effect
 * on a non-idempotent request (bots, prefetch, retry all created orphan drafts).
 * Now the insert only happens when the user explicitly clicks "Tạo workflow mới",
 * satisfying the rule: mutations go through explicit user action, not page render.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useT } from "@/i18n/provider";
import { workflows as dict } from "@/i18n/dictionaries/workflows";
import type { WorkflowGraph } from "@/lib/workflow/types";

const STARTER_GRAPH: WorkflowGraph = {
  nodes: [{ id: "n1", kind: "agent", prompt: "" }],
  edges: [],
};

export default function NewWorkflowPage() {
  const t = useT(dict);
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Workflow mới", graph: STARTER_GRAPH }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? t("wf.new.err"));
      }
      const { id } = (await res.json()) as { id: string };
      router.push(`/workflows/${encodeURIComponent(id)}/edit`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("wf.new.err"));
      setCreating(false);
    }
  }

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => void handleCreate()}
        disabled={creating}
        className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-fill)] px-6 py-2.5 text-sm font-semibold text-white shadow hover:opacity-90 disabled:opacity-50 transition"
        autoFocus
      >
        {creating && <Loader2 size={14} className="animate-spin" aria-hidden />}
        {creating ? t("wf.new.creating") : t("wf.newBlank")}
      </button>
    </div>
  );
}
