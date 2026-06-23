# Workflow QA — feature upgrades  (STATUS 2026-06-23: ~all DONE — verified in code)

Grounded re-audit 2026-06-23 (`checkpoint/cloud-first-2026-06-23`): the 06-05/06 list is
STALE. Verified SHIPPED in code:
- ✅ Schedule mgmt: toggle enable/disable + delete + edit-cron — `WorkflowDetailClient`
  (PATCH `{enabled}` / PATCH cron / DELETE) over `api/workflows/schedules/[id]`.
- ✅ Editor delete node (toolbar btn + ⌫ keyboard) + delete/relabel edges (true/false).
- ✅ Editor connect nodes (onConnect + addEdge), verified handles.
- ✅ Editor unsaved-changes guard (`isDirty` + beforeunload) — `WorkflowEditor`.
- ✅ Structured condition form (left / op-select / right) — `ConditionForm` in `NodeConfigPanel`.
- ✅ Connector/action + MCP server/tool **dropdowns** + schema-driven args (`SchemaArgsForm`).
- ✅ Run cancel (sync long run) — PATCH `runs/[id]` `{action:"cancel"}` + cancel button.

## Genuinely remaining (minor / deferred — NOT blockers)
- foreach **body** still a raw-JSON textarea (no visual ForeachForm builder). Low priority.
- Connector EXTERNAL writes in workflow + manual **BLAST_HIGH** preview/confirm — gated on
  connector-write GA (§10 deferral), not a bug.
