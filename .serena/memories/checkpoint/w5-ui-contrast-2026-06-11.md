# Checkpoint: w5-ui-contrast — 2026-06-11

## What was done
- W5 residual contrast (backlog/matte-dark-qa-ui-bugs.md ①②③④), branch `feat/r2-postrelease`:
  - ① `:root --accent-muted/--accent-glow` retint → rgba(31,111,150,…) (light accent #1f6f96); dark untouched.
  - ③ New token `--accent-fill: #1f6f96` (BOTH modes — white text 5.57:1; dark `--accent` #36a6d6 was 2.77:1).
    15 call-sites `bg-[var(--color-accent)]`+`text-white` → `bg-[var(--accent-fill)]`. Links untouched.
  - ② `useChartTheme` gains `series: { accent, sky }`: light #2a8fbf (3.63:1 on white) / #0284c7 (4.10:1);
    dark keeps #36a6d6/#0ea5e9 (6.53:1 on #14161b). Applied: ActivityTimeline, CostByModel, CostByProject,
    TokensByDay, Doughnut (2 cyan entries via seriesPalette()), TrendChart (dimColors(); lineStroke logic kept).
  - ④ decisions/matte-dark-redesign.md: secondary 11.4/6.7 → 8.04/8.12 (QA A4 live numbers) + accent #1f6f96 line.
- New guard `src/app/globals-contrast.test.ts` (parses globals.css, computes WCAG ratios in code).

## Files changed
- src/app/globals.css · src/hooks/useChartTheme.ts · src/app/globals-contrast.test.ts (new)
- Charts: dashboard/{ActivityTimeline,CostByModel,CostByProject,TokensByDay,Doughnut}.tsx, eval/TrendChart.tsx(+test)
- CTA swap (13 files): app/{login,register,workflows/new}/page.tsx; components/workflows/{WorkflowsClient,
  WorkflowDetailClient,editor/WorkflowEditor,editor/AiGeneratePanel}.tsx; agents/AgentDrawer.tsx;
  chat/ConfirmCard.tsx; connectors/{McpServersSection,ConnectorsClient}.tsx; machines-manager.tsx
- .serena/memories/{decisions/matte-dark-redesign.md, backlog/matte-dark-qa-ui-bugs.md}

## Current state
- Targeted vitest: 18 files / 116 tests pass. `npx tsc --noEmit` clean. No commits made (per constraints).

## Next steps
- Orchestrator: review + commit; decide CHANGELOG fix (released-section line still says "secondary 11.4/6.7:1").
- Out-of-scope residuals: Heatmap (non-recharts, color-mix ramp), cost-chart.tsx (dead code, no importers),
  metric-colors.ts cpu (#36a6d6, machines page), TrendChart non-cyan dims (#22c55e 2.1:1, #f59e0b 2.15:1 on white).

## Blockers / Risks
- `--accent-fill` vs dark `--surface-2` = 2.99:1 (fill-vs-bg, non-text); white label carries identification — noted.
