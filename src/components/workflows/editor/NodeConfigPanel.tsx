"use client";

/**
 * NodeConfigPanel — per-kind configuration form for a selected WfNode.
 *
 * Renders the right form based on node.kind:
 *   agent     → system (textarea) + prompt (textarea)
 *   connector → connectorId (text) + action (text) + args (JSON textarea)
 *   condition → when predicate (JSON textarea + parse error display)
 *   foreach   → items (text) + body (JSON textarea + parse error display)
 *
 * On change → calls onChange(updatedNode). PURE UI — no side effects.
 */

import { useState, useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import type { WfNode, WfAgentNode, WfConnectorNode, WfConditionNode, WfForeachNode, WfMcpNode, Predicate, WorkflowGraph, Op, Comparator } from "@/lib/workflow/types";
import { useT } from "@/i18n/provider";
import { workflows as dict } from "@/i18n/dictionaries/workflows";
import type { Translator } from "@/i18n/types";
import type { ConnectorListItem } from "@/lib/connectors/types";
import { FOREACH_STEP_KINDS, type ForeachStepKind, linearize, buildLinearGraph, nextStepId, makeStep, changeStepKind, moveStep } from "./foreach-body";
import { variableSuggestions } from "./variableHints";
import { parseArgSchema, type ArgField } from "./schemaForm";
import {
  PREDICATE_OPS,
  type Path,
  isGroup,
  groupMode,
  groupChildren,
  getAt,
  setMode,
  setModeAt,
  addComparator,
  addGroup,
  removeBranch,
  updateComparator,
} from "./predicateForm";

// ── Shared style helpers ────────────────────────────────────────────────────

function label(text: string) {
  return (
    <label className="block text-xs font-semibold text-neutral-500 mb-1">
      {text}
    </label>
  );
}

function inputCls(error?: boolean) {
  return (
    "w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-100 " +
    "focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] " +
    (error
      ? "border-red-400 dark:border-red-500"
      : "border-neutral-200 dark:border-neutral-700")
  );
}

function errorMsg(msg: string) {
  return <p className="mt-1 text-xs text-red-500">{msg}</p>;
}

function field(children: React.ReactNode) {
  return <div className="mb-4">{children}</div>;
}

// Clickable chips that insert a {{variable}} token at the cursor of a text field.
// Sibling-derived suggestions come from variableSuggestions(); cursor position is
// read from the linked input/textarea ref so insertion lands where the user is typing.
function VariableHints({
  tokens,
  inputRef,
  value,
  onChange,
  hintLabel,
}: {
  tokens: string[];
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  hintLabel: string;
}) {
  if (tokens.length === 0) return null;
  function insert(tok: string) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + tok + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + tok.length;
      try { el.setSelectionRange(pos, pos); } catch { /* some input types disallow */ }
    });
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      <span className="text-[10px] text-neutral-400">{hintLabel}</span>
      {tokens.map((tok) => (
        <button
          key={tok}
          type="button"
          onClick={() => insert(tok)}
          className="rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-mono text-[10px] text-neutral-600 transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
        >
          {tok}
        </button>
      ))}
    </div>
  );
}

// ── Agent form ──────────────────────────────────────────────────────────────

function AgentForm({
  node,
  onChange,
  t,
  suggestions,
  presets = [],
}: {
  node: WfAgentNode;
  onChange: (n: WfNode) => void;
  t: Translator;
  suggestions: string[];
  /** P3: custom-agent presets (per-user) — chọn → node lưu customAgentId */
  presets?: { id: string; name: string }[];
}) {
  const systemRef = useRef<HTMLTextAreaElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // B1: optional structured-output JSON schema. Local text state so the user can type
  // invalid JSON without losing it; only a valid plain object propagates via onChange.
  const [formatText, setFormatText] = useState(node.format ? JSON.stringify(node.format, null, 2) : "");
  const [formatError, setFormatError] = useState<string | null>(null);

  // Re-seed when a different node is selected (pattern: ConditionForm/SchemaArgsForm).
  useEffect(() => {
    setFormatText(node.format ? JSON.stringify(node.format, null, 2) : "");
    setFormatError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  function handleFormat(raw: string) {
    setFormatText(raw);
    if (!raw.trim()) {
      setFormatError(null);
      onChange({ ...node, format: undefined });
      return;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setFormatError(t("wf.node.agent.formatNotObject"));
        return;
      }
      setFormatError(null);
      onChange({ ...node, format: parsed as Record<string, unknown> });
    } catch {
      setFormatError(t("wf.node.jsonInvalid"));
    }
  }

  const usingPreset = !!node.customAgentId;

  return (
    <>
      {(presets.length > 0 || usingPreset) &&
        field(
          <>
            {label(t("wf.node.agent.presetLabel"))}
            <select
              className={inputCls()}
              value={node.customAgentId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                const next = { ...node };
                if (v) next.customAgentId = v;
                else delete next.customAgentId;
                onChange(next);
              }}
            >
              <option value="">{t("wf.node.agent.presetNone")}</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
              {node.customAgentId && !presets.find((p) => p.id === node.customAgentId) && (
                <option value={node.customAgentId}>{node.customAgentId}</option>
              )}
            </select>
            {usingPreset && <p className="mt-1 text-xs text-neutral-400">{t("wf.node.agent.presetHint")}</p>}
            <a href="/settings/custom-agents" className="mt-1 inline-block text-xs text-[var(--color-accent)] hover:underline">
              {t("wf.node.agent.managePresets")}
            </a>
          </>,
        )}
      {presets.length === 0 && !usingPreset &&
        field(
          <p className="text-xs text-neutral-400">
            {t("wf.node.agent.noPresets")}{" "}
            <a href="/settings/custom-agents" className="text-[var(--color-accent)] hover:underline">
              {t("wf.node.agent.managePresets")}
            </a>
          </p>,
        )}
      {!usingPreset &&
        field(
          <>
            {label(t("wf.node.agent.systemLabel"))}
            <textarea
              ref={systemRef}
              className={inputCls()}
              rows={3}
              value={node.system ?? ""}
              placeholder={t("wf.node.agent.systemPlaceholder")}
              onChange={(e) => onChange({ ...node, system: e.target.value || undefined })}
            />
            <VariableHints
              tokens={suggestions}
              inputRef={systemRef}
              value={node.system ?? ""}
              onChange={(v) => onChange({ ...node, system: v || undefined })}
              hintLabel={t("wf.node.insertVar")}
            />
          </>,
        )}
      {field(
        <>
          {label(t("wf.node.agent.promptLabel"))}
          <textarea
            ref={promptRef}
            className={inputCls()}
            rows={4}
            value={node.prompt}
            placeholder={t("wf.node.agent.promptPlaceholder")}
            onChange={(e) => onChange({ ...node, prompt: e.target.value })}
          />
          <VariableHints
            tokens={suggestions}
            inputRef={promptRef}
            value={node.prompt}
            onChange={(v) => onChange({ ...node, prompt: v })}
            hintLabel={t("wf.node.insertVar")}
          />
        </>,
      )}
      {field(
        <>
          {label(t("wf.node.agent.formatLabel"))}
          <textarea
            className={inputCls(!!formatError)}
            rows={5}
            value={formatText}
            placeholder={'{\n  "type": "object",\n  "properties": { "verdict": { "enum": ["PASS", "FAIL"] } }\n}'}
            onChange={(e) => handleFormat(e.target.value)}
          />
          {formatError && errorMsg(formatError)}
          <p className="mt-1 text-xs text-neutral-400 break-words">{t("wf.node.agent.formatHint")}</p>
        </>,
      )}
    </>
  );
}

// ── Connector form ──────────────────────────────────────────────────────────

function ConnectorForm({
  node,
  onChange,
  t,
  connectors,
  suggestions,
}: {
  node: WfConnectorNode;
  onChange: (n: WfNode) => void;
  t: Translator;
  connectors: ConnectorListItem[];
  suggestions: string[];
}) {
  const selectedConnector = connectors.find((c) => c.id === node.connectorId) ?? null;
  const availableActions = selectedConnector?.tools ?? [];
  const selectedTool = availableActions.find((tl) => tl.name === node.action) ?? null;
  const useSelects = connectors.length > 0;

  return (
    <>
      {field(
        <>
          {label(t("wf.node.connector.idLabel"))}
          {useSelects ? (
            <select
              className={inputCls()}
              value={node.connectorId}
              onChange={(e) => onChange({ ...node, connectorId: e.target.value, action: "" })}
            >
              <option value="">{t("wf.node.connector.selectConnector")}</option>
              {connectors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.connected ? "🟢" : "⚫"}
                </option>
              ))}
              {node.connectorId && !connectors.find((c) => c.id === node.connectorId) && (
                <option value={node.connectorId}>{node.connectorId}</option>
              )}
            </select>
          ) : (
            <input
              type="text"
              className={inputCls()}
              value={node.connectorId}
              placeholder={t("wf.node.connector.idPlaceholder")}
              onChange={(e) => onChange({ ...node, connectorId: e.target.value })}
            />
          )}
          {selectedConnector && !selectedConnector.connected && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              {t("wf.node.connector.notConnected")}
            </p>
          )}
        </>,
      )}
      {field(
        <>
          {label(t("wf.node.connector.actionLabel"))}
          {useSelects ? (
            availableActions.length > 0 ? (
              <select
                className={inputCls()}
                value={node.action}
                disabled={!node.connectorId}
                onChange={(e) => onChange({ ...node, action: e.target.value, args: {} })}
              >
                <option value="">{t("wf.node.connector.selectAction")}</option>
                {availableActions.map((tool) => (
                  <option key={tool.name} value={tool.name} title={tool.description}>{tool.name}</option>
                ))}
              </select>
            ) : (
              <>
                <input
                  type="text"
                  className={inputCls()}
                  value={node.action}
                  placeholder={t("wf.node.connector.actionPlaceholder")}
                  onChange={(e) => onChange({ ...node, action: e.target.value })}
                />
                {node.connectorId && (
                  <p className="mt-1 text-xs text-neutral-400">
                    {t("wf.node.connector.noTools")}
                  </p>
                )}
              </>
            )
          ) : (
            <input
              type="text"
              className={inputCls()}
              value={node.action}
              placeholder={t("wf.node.connector.actionPlaceholder")}
              onChange={(e) => onChange({ ...node, action: e.target.value })}
            />
          )}
        </>,
      )}
      {selectedTool?.description && (
        <p className="-mt-2 mb-3 text-xs text-neutral-400">{selectedTool.description}</p>
      )}
      {field(
        <SchemaArgsForm
          node={node}
          onChange={onChange}
          t={t}
          suggestions={suggestions}
          schema={selectedTool?.parameters ?? null}
        />,
      )}
    </>
  );
}

// ── MCP form (P2) ────────────────────────────────────────────────────────────
// Server (per-user) → tool (toolDetails từ /api/connectors/mcp) → SchemaArgsForm.
// Tool write/chưa-trust được CHỌN nhưng cảnh báo: real-run sẽ fail-closed
// (assertMcpAllowed) — editor không giấu hành vi runtime (Rule 12).

export type McpServerItem = {
  slug: string;
  name: string;
  tools: string[];
  toolDetails: { name: string; nsName: string; description: string; parameters: object; kind: "read" | "write" }[];
};

function McpForm({
  node,
  onChange,
  t,
  suggestions,
  servers,
}: {
  node: WfMcpNode;
  onChange: (n: WfNode) => void;
  t: Translator;
  suggestions: string[];
  servers: McpServerItem[];
}) {
  const selectedServer = servers.find((s) => s.slug === node.server) ?? null;
  const availableTools = selectedServer?.toolDetails ?? [];
  const selectedTool = availableTools.find((td) => td.name === node.tool) ?? null;

  if (servers.length === 0) {
    return <p className="text-xs text-neutral-400">{t("wf.node.mcp.noServers")}</p>;
  }

  return (
    <>
      {field(
        <>
          {label(t("wf.node.mcp.serverLabel"))}
          <select
            className={inputCls()}
            value={node.server}
            onChange={(e) => onChange({ ...node, server: e.target.value, tool: "", args: {} })}
          >
            <option value="">{t("wf.node.mcp.selectServer")}</option>
            {servers.map((s) => (
              <option key={s.slug} value={s.slug}>{s.name}</option>
            ))}
            {node.server && !servers.find((s) => s.slug === node.server) && (
              <option value={node.server}>{node.server}</option>
            )}
          </select>
        </>,
      )}
      {field(
        <>
          {label(t("wf.node.mcp.toolLabel"))}
          <select
            className={inputCls()}
            value={node.tool}
            disabled={!node.server}
            onChange={(e) => onChange({ ...node, tool: e.target.value, args: {} })}
          >
            <option value="">{t("wf.node.mcp.selectTool")}</option>
            {availableTools.map((td) => (
              <option key={td.name} value={td.name} title={td.description}>{td.name}</option>
            ))}
            {node.tool && !availableTools.find((td) => td.name === node.tool) && (
              <option value={node.tool}>{node.tool}</option>
            )}
          </select>
        </>,
      )}
      {selectedTool?.description && (
        <p className="-mt-2 mb-3 text-xs text-neutral-400">{selectedTool.description}</p>
      )}
      {selectedTool && selectedTool.kind === "write" && (
        <p className="-mt-1 mb-3 text-xs text-amber-600 dark:text-amber-400">{t("wf.node.mcp.writeBlocked")}</p>
      )}
      {field(
        <SchemaArgsForm
          node={node}
          onChange={onChange}
          t={t}
          suggestions={suggestions}
          schema={selectedTool?.parameters ?? null}
        />,
      )}
    </>
  );
}

// ── Connector args: schema-driven form (#1) ─────────────────────────────────
// Renders a labelled field per tool parameter (from its JSON schema) instead of a
// raw JSON blob. Falls back to a raw-JSON "Advanced" editor for nested/array args
// (or when no schema is available, e.g. a hand-typed connectorId).

function SchemaArgsForm({
  node,
  onChange,
  t,
  suggestions,
  schema,
}: {
  // P2: dùng chung cho connector node LẪN mcp node — cả hai cùng shape `args`.
  node: WfConnectorNode | WfMcpNode;
  onChange: (n: WfNode) => void;
  t: Translator;
  suggestions: string[];
  schema: object | null;
}) {
  const { fields, propCount, flat } = parseArgSchema(schema);
  // Re-seed key: connector đổi theo `action`, mcp đổi theo `tool`.
  const actionKey = node.kind === "connector" ? node.action : node.tool;
  // Default to the friendly form when the schema is a renderable object (flat fields,
  // or a no-arg object); raw JSON only when no schema is available yet or the schema
  // has fields the form can't render. Recomputed each render so the default RE-SYNCS
  // when the connector list (hence the schema) loads ASYNC after mount — otherwise the
  // panel gets stuck on JSON, since `schema` is null at first paint. [QA fix #1]
  const schemaIsObject = !!schema && (schema as { type?: string }).type === "object";
  const defaultAdvanced = !schemaIsObject || (propCount > 0 && !flat);
  const [advanced, setAdvanced] = useState(defaultAdvanced);
  const [argsText, setArgsText] = useState(
    Object.keys(node.args).length ? JSON.stringify(node.args, null, 2) : "",
  );
  const [argsError, setArgsError] = useState<string | null>(null);

  // Re-seed raw text + default mode when the node or the selected action/tool changes.
  useEffect(() => {
    setArgsText(Object.keys(node.args).length ? JSON.stringify(node.args, null, 2) : "");
    setAdvanced(defaultAdvanced);
    setArgsError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id, actionKey, defaultAdvanced]);

  function setArg(key: string, value: unknown) {
    const next = { ...node.args };
    if (value === undefined || value === "") delete next[key];
    else next[key] = value;
    onChange({ ...node, args: next });
  }

  function handleRaw(raw: string) {
    setArgsText(raw);
    if (!raw.trim()) {
      setArgsError(null);
      onChange({ ...node, args: {} });
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      setArgsError(null);
      onChange({ ...node, args: parsed });
    } catch {
      setArgsError(t("wf.node.jsonInvalid"));
    }
  }

  return (
    <>
      <div className="mb-1 flex items-center justify-between">
        {label(t("wf.node.connector.argsLabel"))}
        {schema && (fields.length > 0 || propCount === 0) && (
          <button
            type="button"
            className="text-xs text-neutral-500 underline hover:text-[var(--color-accent)]"
            onClick={() => setAdvanced((a) => !a)}
          >
            {advanced ? t("wf.node.connector.formArgs") : t("wf.node.connector.advancedArgs")}
          </button>
        )}
      </div>

      {advanced || !schema ? (
        <>
          <textarea
            className={inputCls(!!argsError)}
            rows={5}
            value={argsText}
            placeholder={'{\n  "key": "{{var}}"\n}'}
            onChange={(e) => handleRaw(e.target.value)}
          />
          {argsError && errorMsg(argsError)}
        </>
      ) : propCount === 0 ? (
        <p className="text-xs text-neutral-400">{t("wf.node.connector.noArgs")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {fields.map((f) => (
            <ArgFieldInput key={f.key} field={f} node={node} setArg={setArg} suggestions={suggestions} t={t} />
          ))}
          {fields.length < propCount && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{t("wf.node.connector.someAdvanced")}</p>
          )}
        </div>
      )}
    </>
  );
}

function ArgFieldInput({
  field: f,
  node,
  setArg,
  suggestions,
  t,
}: {
  field: ArgField;
  node: WfConnectorNode | WfMcpNode;
  setArg: (key: string, value: unknown) => void;
  suggestions: string[];
  t: Translator;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const raw = node.args[f.key];
  const labelText = f.required ? `${f.key} *` : f.key;

  if (f.kind === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
        <input type="checkbox" checked={raw === true} onChange={(e) => setArg(f.key, e.target.checked)} />
        <span className="font-semibold text-neutral-500">{labelText}</span>
        {f.description && <span className="text-xs font-normal text-neutral-400">{f.description}</span>}
      </label>
    );
  }

  if (f.kind === "enum") {
    return (
      <div>
        {label(labelText)}
        <select className={inputCls()} value={String(raw ?? "")} onChange={(e) => setArg(f.key, e.target.value)}>
          <option value="">—</option>
          {f.enumValues!.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        {f.description && <p className="mt-1 text-xs text-neutral-400">{f.description}</p>}
      </div>
    );
  }

  if (f.kind === "number") {
    return (
      <div>
        {label(labelText)}
        <input
          type="number"
          className={inputCls()}
          value={typeof raw === "number" ? raw : ""}
          onChange={(e) => setArg(f.key, e.target.value === "" ? undefined : Number(e.target.value))}
        />
        {f.description && <p className="mt-1 text-xs text-neutral-400">{f.description}</p>}
      </div>
    );
  }

  // string
  const strVal = raw === undefined || raw === null ? "" : String(raw);
  return (
    <div>
      {label(labelText)}
      <input
        ref={ref}
        type="text"
        className={inputCls()}
        value={strVal}
        placeholder={f.description}
        onChange={(e) => setArg(f.key, e.target.value)}
      />
      <VariableHints
        tokens={suggestions}
        inputRef={ref}
        value={strVal}
        onChange={(v) => setArg(f.key, v)}
        hintLabel={t("wf.node.insertVar")}
      />
    </div>
  );
}

// ── Condition form ──────────────────────────────────────────────────────────

// All comparison operators supported by the engine. Built from PREDICATE_OPS (the
// single source shared with the engine Op union — see predicateForm) so the UI can
// never drift from what evalPredicate accepts. The Record<Op,…> forces a label for
// every op at compile time.
const OP_LABELS: Record<Op, string> = {
  eq: "= (eq)",
  ne: "≠ (ne)",
  gt: "> (gt)",
  lt: "< (lt)",
  gte: "≥ (gte)",
  lte: "≤ (lte)",
  contains: "contains",
  not_contains: "not_contains",
  exists: "exists",
  not_exists: "not_exists",
};
const OPS: { value: Op; label: string }[] = PREDICATE_OPS.map((value) => ({ value, label: OP_LABELS[value] }));

function isSimpleComparator(p: Predicate): p is Comparator {
  return "op" in p;
}

/** First comparator found anywhere in a predicate tree (for group→simple downgrade). */
function firstComparator(p: Predicate): Comparator {
  if (isSimpleComparator(p)) return p;
  for (const child of groupChildren(p)) {
    const c = firstComparator(child);
    if (c) return c;
  }
  return { left: "", op: "eq", right: "" };
}

// Recursive editor for an all/any predicate group. Reads the group at `path`
// inside `root`; every edit produces a NEW root via the pure predicateForm
// helpers and is reported through onChangeRoot. Comparator leaves reuse the same
// left / op / right inputs as the simple form; nested groups recurse.
function GroupPredicateEditor({
  root,
  path,
  onChangeRoot,
  t,
}: {
  root: Predicate;
  path: Path;
  onChangeRoot: (p: Predicate) => void;
  t: Translator;
}) {
  const group = getAt(root, path);
  if (!group || !isGroup(group)) return null;
  const mode = groupMode(group)!;
  const children = groupChildren(group);
  const isRoot = path.length === 0;

  return (
    <div className={isRoot ? "" : "ml-2 border-l-2 border-neutral-200 pl-2 dark:border-neutral-700"}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs text-neutral-500">{t("wf.cond.matchLabel")}</span>
        <select
          className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
          value={mode}
          aria-label={t("wf.cond.groupMode")}
          onChange={(e) => onChangeRoot(setModeAt(root, path, e.target.value as "all" | "any"))}
        >
          <option value="all">{t("wf.cond.all")}</option>
          <option value="any">{t("wf.cond.any")}</option>
        </select>
        {!isRoot && (
          <button
            type="button"
            className="ml-auto rounded p-1 text-neutral-400 hover:text-red-500"
            title={t("wf.cond.remove")}
            aria-label={t("wf.cond.remove")}
            onClick={() => onChangeRoot(removeBranch(root, path))}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        {children.map((child, i) => {
          const childPath = [...path, i];
          if (isGroup(child)) {
            return (
              <GroupPredicateEditor key={i} root={root} path={childPath} onChangeRoot={onChangeRoot} t={t} />
            );
          }
          const c = child as Comparator;
          return (
            <div key={i} className="flex items-center gap-1">
              <input
                type="text"
                className={inputCls() + " !px-2 !py-1 text-xs"}
                value={c.left}
                placeholder="{{...}}"
                aria-label={t("wf.node.condition.leftLabel")}
                onChange={(e) => onChangeRoot(updateComparator(root, childPath, { left: e.target.value }))}
              />
              <select
                className="rounded-lg border border-neutral-200 bg-white px-1 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
                value={c.op}
                aria-label={t("wf.node.condition.opLabel")}
                onChange={(e) => onChangeRoot(updateComparator(root, childPath, { op: e.target.value as Op }))}
              >
                {OPS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input
                type="text"
                className={inputCls() + " !px-2 !py-1 text-xs"}
                value={String(c.right ?? "")}
                placeholder="0"
                aria-label={t("wf.node.condition.rightLabel")}
                onChange={(e) => onChangeRoot(updateComparator(root, childPath, { right: e.target.value }))}
              />
              <button
                type="button"
                className="shrink-0 rounded p-1 text-neutral-400 hover:text-red-500"
                title={t("wf.cond.remove")}
                aria-label={t("wf.cond.remove")}
                onClick={() => onChangeRoot(removeBranch(root, childPath))}
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex gap-2">
        <button
          type="button"
          className="text-xs font-semibold text-[var(--color-accent)] hover:underline"
          onClick={() => onChangeRoot(addComparator(root, path))}
        >
          {t("wf.cond.addCondition")}
        </button>
        <button
          type="button"
          className="text-xs font-semibold text-neutral-500 hover:underline"
          onClick={() => onChangeRoot(addGroup(root, path))}
        >
          {t("wf.cond.addGroup")}
        </button>
      </div>
    </div>
  );
}

function ConditionForm({
  node,
  onChange,
  t,
  suggestions,
}: {
  node: WfConditionNode;
  onChange: (n: WfNode) => void;
  t: Translator;
  suggestions: string[];
}) {
  const leftRef = useRef<HTMLInputElement>(null);
  const rightRef = useRef<HTMLInputElement>(null);
  const initialMode = (p: Predicate): "form" | "group" | "json" =>
    isGroup(p) ? "group" : isSimpleComparator(p) ? "form" : "json";
  const [viewMode, setViewMode] = useState<"form" | "group" | "json">(initialMode(node.when));

  // Structured-form local state
  const simple0 = isSimpleComparator(node.when);
  const [left, setLeft] = useState(simple0 ? (node.when as Comparator).left : "");
  const [op, setOp] = useState<Op>(simple0 ? (node.when as Comparator).op : "eq");
  const [right, setRight] = useState(simple0 ? String((node.when as Comparator).right ?? "") : "");

  // JSON-mode local state
  const [jsonText, setJsonText] = useState(JSON.stringify(node.when, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);

  // Sync local state when a different node is selected (node.id changes)
  useEffect(() => {
    if (isSimpleComparator(node.when)) {
      const c = node.when as Comparator;
      setLeft(c.left);
      setOp(c.op);
      setRight(String(c.right ?? ""));
    }
    setJsonText(JSON.stringify(node.when, null, 2));
    setParseError(null);
    setViewMode(initialMode(node.when));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  function handleFormField(field: "left" | "op" | "right", value: string) {
    const newLeft = field === "left" ? value : left;
    const newOp = (field === "op" ? value : op) as Op;
    const newRight = field === "right" ? value : right;
    if (field === "left") setLeft(value);
    else if (field === "op") setOp(value as Op);
    else setRight(value);
    const predicate: Comparator = { left: newLeft, op: newOp, right: newRight };
    onChange({ ...node, when: predicate });
  }

  function switchToJson() {
    setJsonText(JSON.stringify(node.when, null, 2));
    setParseError(null);
    setViewMode("json");
  }

  function switchToForm() {
    // Downgrade to a single comparator (keep the first one found in a group).
    const c = firstComparator(node.when);
    setLeft(c.left);
    setOp(c.op);
    setRight(String(c.right ?? ""));
    if (!isSimpleComparator(node.when)) onChange({ ...node, when: c });
    setViewMode("form");
  }

  function switchToGroup() {
    // Wrap the current comparator into an ALL group (the common compound case).
    if (!isGroup(node.when)) onChange({ ...node, when: setMode(node.when, "all") });
    setViewMode("group");
  }

  function handleJsonChange(raw: string) {
    setJsonText(raw);
    try {
      const parsed = JSON.parse(raw) as Predicate;
      setParseError(null);
      onChange({ ...node, when: parsed });
    } catch {
      setParseError(t("wf.node.jsonInvalid"));
    }
  }

  // Mode switcher — links between single / group / JSON authoring.
  const modeBtn = (onClick: () => void, txt: string) => (
    <button
      type="button"
      onClick={onClick}
      className="text-xs text-neutral-400 transition hover:text-neutral-600 dark:hover:text-neutral-200"
    >
      {txt}
    </button>
  );
  const modeSwitcher = (
    <div className="mb-3 flex justify-end gap-3">
      {viewMode === "form" && modeBtn(switchToGroup, `${t("wf.cond.groupMode")} ↗`)}
      {viewMode === "group" && modeBtn(switchToForm, `${t("wf.cond.simpleMode")} ↗`)}
      {viewMode !== "json" && modeBtn(switchToJson, `${t("wf.node.condition.jsonMode")} ↗`)}
      {viewMode === "json" && isSimpleComparator(node.when) && modeBtn(switchToForm, `${t("wf.node.condition.formMode")} ↗`)}
      {viewMode === "json" && isGroup(node.when) && modeBtn(() => setViewMode("group"), `${t("wf.cond.groupMode")} ↗`)}
    </div>
  );

  if (viewMode === "group") {
    return (
      <>
        {modeSwitcher}
        {field(
          <>
            <GroupPredicateEditor
              root={node.when}
              path={[]}
              onChangeRoot={(p) => onChange({ ...node, when: p })}
              t={t}
            />
            <p className="mt-2 text-xs text-neutral-400 break-words">{t("wf.node.condition.hint")}</p>
          </>,
        )}
      </>
    );
  }

  if (viewMode === "form") {
    return (
      <>
        {modeSwitcher}
        {field(
          <>
            <label className="block text-xs font-semibold text-neutral-500 mb-1" htmlFor={`cond-left-${node.id}`}>
              {t("wf.node.condition.leftLabel")}
            </label>
            <input
              ref={leftRef}
              id={`cond-left-${node.id}`}
              type="text"
              className={inputCls()}
              value={left}
              placeholder="{{steps.n1.output.count}}"
              aria-label={t("wf.node.condition.leftLabel")}
              onChange={(e) => handleFormField("left", e.target.value)}
            />
            <VariableHints
              tokens={suggestions}
              inputRef={leftRef}
              value={left}
              onChange={(v) => handleFormField("left", v)}
              hintLabel={t("wf.node.insertVar")}
            />
          </>,
        )}
        {field(
          <>
            <label className="block text-xs font-semibold text-neutral-500 mb-1" htmlFor={`cond-op-${node.id}`}>
              {t("wf.node.condition.opLabel")}
            </label>
            <select
              id={`cond-op-${node.id}`}
              className={inputCls()}
              value={op}
              aria-label={t("wf.node.condition.opLabel")}
              onChange={(e) => handleFormField("op", e.target.value)}
            >
              {OPS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </>,
        )}
        {field(
          <>
            <label className="block text-xs font-semibold text-neutral-500 mb-1" htmlFor={`cond-right-${node.id}`}>
              {t("wf.node.condition.rightLabel")}
            </label>
            <input
              ref={rightRef}
              id={`cond-right-${node.id}`}
              type="text"
              className={inputCls()}
              value={right}
              placeholder="0"
              aria-label={t("wf.node.condition.rightLabel")}
              onChange={(e) => handleFormField("right", e.target.value)}
            />
            <VariableHints
              tokens={suggestions}
              inputRef={rightRef}
              value={right}
              onChange={(v) => handleFormField("right", v)}
              hintLabel={t("wf.node.insertVar")}
            />
            <p className="mt-1 text-xs text-neutral-400 break-words">{t("wf.node.condition.hint")}</p>
          </>,
        )}
      </>
    );
  }

  // JSON mode
  return (
    <>
      {modeSwitcher}
      {field(
        <>
          {label(t("wf.node.condition.label"))}
          <textarea
            className={inputCls(!!parseError)}
            rows={6}
            value={jsonText}
            placeholder={'{\n  "left": "{{steps.n1.output.count}}",\n  "op": "gt",\n  "right": 0\n}'}
            onChange={(e) => handleJsonChange(e.target.value)}
          />
          {parseError && errorMsg(parseError)}
          <p className="mt-1 text-xs text-neutral-400 break-words">{t("wf.node.condition.hint")}</p>
        </>,
      )}
    </>
  );
}

// ── Foreach form ────────────────────────────────────────────────────────────

function ForeachForm({
  node,
  onChange,
  t,
  suggestions,
  connectors,
  servers,
  presets,
}: {
  node: WfForeachNode;
  onChange: (n: WfNode) => void;
  t: Translator;
  suggestions: string[];
  connectors: ConnectorListItem[];
  servers: McpServerItem[];
  presets: { id: string; name: string }[];
}) {
  const itemsRef = useRef<HTMLInputElement>(null);
  const [bodyText, setBodyText] = useState(JSON.stringify(node.body, null, 2));
  const [bodyError, setBodyError] = useState<string | null>(null);

  // Linear chain of agent/connector/mcp steps ⇒ structured list; branchy/nested body ⇒
  // raw-JSON only (linearize returns null). The user can drop to JSON anytime; they can't
  // force the step list onto a branchy body (would silently drop branches).
  const linear = linearize(node.body);
  const [mode, setMode] = useState<"structured" | "json">(linear !== null ? "structured" : "json");
  const effectiveMode: "structured" | "json" = mode === "structured" && linear === null ? "json" : mode;
  const steps = linear ?? [];
  const kindLabel = (k: string) => (k === "mcp" ? "MCP" : k.charAt(0).toUpperCase() + k.slice(1));

  // Edges are AUTO-GENERATED as a linear chain — the user never writes JSON edges.
  function commitSteps(next: WfNode[]) {
    const body = buildLinearGraph(next, node.body);
    setBodyText(JSON.stringify(body, null, 2));
    setBodyError(null);
    onChange({ ...node, body });
  }
  const replaceAt = (idx: number, n: WfNode) => commitSteps(steps.map((s, i) => (i === idx ? n : s)));

  function handleBodyChange(raw: string) {
    setBodyText(raw);
    try {
      const parsed = JSON.parse(raw) as WorkflowGraph;
      setBodyError(null);
      onChange({ ...node, body: parsed });
    } catch {
      setBodyError(t("wf.node.jsonInvalid"));
    }
  }

  const toggleCls = (on: boolean) =>
    `rounded px-2 py-0.5 text-xs font-medium transition ${
      on ? "bg-[var(--color-accent)] text-white" : "bg-neutral-100 text-neutral-500 hover:text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
    }`;

  return (
    <>
      {field(
        <>
          {label(t("wf.node.foreach.itemsLabel"))}
          <input
            ref={itemsRef}
            type="text"
            className={inputCls()}
            value={node.items}
            placeholder="{{steps.n1.output.items}}"
            onChange={(e) => onChange({ ...node, items: e.target.value })}
          />
          <VariableHints
            tokens={suggestions}
            inputRef={itemsRef}
            value={node.items}
            onChange={(v) => onChange({ ...node, items: v })}
            hintLabel={t("wf.node.insertVar")}
          />
          <p className="mt-1 text-xs text-neutral-400">{t("wf.node.foreach.itemsHint")}</p>
        </>,
      )}
      {field(
        <>
          <div className="mb-1.5 flex items-center justify-between">
            {label(t("wf.node.foreach.bodyLabel"))}
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={linear === null}
                className={toggleCls(effectiveMode === "structured") + (linear === null ? " cursor-not-allowed opacity-40" : "")}
                onClick={() => setMode("structured")}
                title={linear === null ? t("wf.node.foreach.complexBody") : undefined}
              >
                {t("wf.node.foreach.modeSteps")}
              </button>
              <button type="button" className={toggleCls(effectiveMode === "json")} onClick={() => setMode("json")}>
                {t("wf.node.foreach.modeJson")}
              </button>
            </div>
          </div>

          {effectiveMode === "structured" ? (
            <div className="space-y-2">
              {steps.length === 0 && <p className="text-xs text-neutral-400">{t("wf.node.foreach.empty")}</p>}
              {steps.map((step, idx) => (
                <div
                  key={step.id}
                  className="rounded-lg border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-800/40"
                >
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-neutral-400">#{idx + 1}</span>
                    <select
                      className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                      value={step.kind}
                      onChange={(e) => replaceAt(idx, changeStepKind(step, e.target.value as ForeachStepKind))}
                    >
                      {FOREACH_STEP_KINDS.map((k) => (
                        <option key={k} value={k}>{kindLabel(k)}</option>
                      ))}
                    </select>
                    <span className="ml-auto flex items-center gap-0.5">
                      <button type="button" className="rounded px-1 text-neutral-400 transition hover:text-neutral-700 disabled:opacity-30 dark:hover:text-neutral-200" disabled={idx === 0} onClick={() => commitSteps(moveStep(steps, idx, -1))} aria-label={t("wf.node.foreach.stepUp")} title={t("wf.node.foreach.stepUp")}>↑</button>
                      <button type="button" className="rounded px-1 text-neutral-400 transition hover:text-neutral-700 disabled:opacity-30 dark:hover:text-neutral-200" disabled={idx === steps.length - 1} onClick={() => commitSteps(moveStep(steps, idx, 1))} aria-label={t("wf.node.foreach.stepDown")} title={t("wf.node.foreach.stepDown")}>↓</button>
                      <button type="button" className="rounded p-0.5 text-neutral-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/20" onClick={() => commitSteps(steps.filter((_, i) => i !== idx))} aria-label={t("wf.node.foreach.stepRemove")} title={t("wf.node.foreach.stepRemove")}><Trash2 size={12} aria-hidden /></button>
                    </span>
                  </div>
                  {step.kind === "agent" && (
                    <AgentForm node={step} onChange={(n) => replaceAt(idx, n)} t={t} suggestions={suggestions} presets={presets} />
                  )}
                  {step.kind === "connector" && (
                    <ConnectorForm node={step} onChange={(n) => replaceAt(idx, n)} t={t} connectors={connectors} suggestions={suggestions} />
                  )}
                  {step.kind === "mcp" && (
                    <McpForm node={step} onChange={(n) => replaceAt(idx, n)} t={t} servers={servers} suggestions={suggestions} />
                  )}
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-1 pt-0.5">
                <span className="text-xs text-neutral-400">{t("wf.node.foreach.addStep")}</span>
                {FOREACH_STEP_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="rounded border border-dashed border-neutral-300 px-2 py-0.5 text-xs text-neutral-500 transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] dark:border-neutral-600"
                    onClick={() => commitSteps([...steps, makeStep(k, nextStepId(steps))])}
                  >
                    + {kindLabel(k)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <textarea
                className={inputCls(!!bodyError)}
                rows={8}
                value={bodyText}
                placeholder={'{\n  "nodes": [...],\n  "edges": [...]\n}'}
                onChange={(e) => handleBodyChange(e.target.value)}
              />
              {bodyError && errorMsg(bodyError)}
            </>
          )}
          <p className="mt-1 text-xs text-neutral-400">{t("wf.node.foreach.bodyHint")}</p>
        </>,
      )}
    </>
  );
}

// ── Main panel ──────────────────────────────────────────────────────────────

const KIND_LABELS: Record<string, string> = {
  agent: "Agent",
  connector: "Connector",
  condition: "Condition",
  foreach: "Foreach",
  mcp: "MCP",
};

export function NodeConfigPanel({
  node,
  onChange,
  onDelete,
  connectors: connectorsProp,
  mcpServers: mcpServersProp,
  customAgents: customAgentsProp,
  allNodes,
  edges,
}: {
  node: WfNode;
  onChange: (updated: WfNode) => void;
  onDelete?: () => void;
  /** Injected for tests; if omitted, fetched from /api/connectors on mount */
  connectors?: ConnectorListItem[];
  /** Injected for tests; if omitted, fetched from /api/connectors/mcp on mount (P2) */
  mcpServers?: McpServerItem[];
  /** Injected for tests; if omitted, fetched from /api/custom-agents on mount (P3) */
  customAgents?: { id: string; name: string }[];
  /** All graph nodes — used to derive upstream {{steps.<id>.output}} variables. */
  allNodes?: WfNode[];
  /** Edges (source→target) — used to compute which nodes are upstream of this one. */
  edges?: ReadonlyArray<{ source: string; target: string }>;
}) {
  // t is called here (top-level component) and passed to sub-forms as a prop,
  // since sub-forms are local functions and cannot call hooks directly.
  const t = useT(dict);
  // A foreach node's body-step forms (which reuse this same `suggestions` array)
  // can reference the loop's {{item}}/{{index}}, so offer them when this is a foreach.
  const suggestions = variableSuggestions(allNodes ?? [], edges ?? [], node.id, {
    inForeachBody: node.kind === "foreach",
  });
  const [connectors, setConnectors] = useState<ConnectorListItem[]>(connectorsProp ?? []);
  const [mcpServers, setMcpServers] = useState<McpServerItem[]>(mcpServersProp ?? []);

  // Capture at mount time — avoids re-firing when a caller passes a new array literal
  const injectedRef = useRef(connectorsProp !== undefined);
  useEffect(() => {
    if (injectedRef.current) return; // test injection — skip fetch
    void fetch("/api/connectors")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { connectors?: ConnectorListItem[] } | null) => {
        if (data?.connectors) setConnectors(data.connectors);
      })
      .catch(() => { /* keep empty — fallback to text inputs */ });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // P2: MCP servers + toolDetails cho McpForm (cùng pattern injection/fetch).
  const mcpInjectedRef = useRef(mcpServersProp !== undefined);
  useEffect(() => {
    if (mcpInjectedRef.current) return; // test injection — skip fetch
    void fetch("/api/connectors/mcp")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { servers?: McpServerItem[] } | null) => {
        if (data?.servers) setMcpServers(data.servers);
      })
      .catch(() => { /* keep empty — McpForm shows the no-servers hint */ });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // P3: custom-agent presets cho AgentForm (cùng pattern injection/fetch).
  const [customAgents, setCustomAgents] = useState<{ id: string; name: string }[]>(customAgentsProp ?? []);
  const caInjectedRef = useRef(customAgentsProp !== undefined);
  useEffect(() => {
    if (caInjectedRef.current) return; // test injection — skip fetch
    void fetch("/api/custom-agents")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { agents?: { id: string; name: string }[] } | null) => {
        if (data?.agents) setCustomAgents(data.agents.map((a) => ({ id: a.id, name: a.name })));
      })
      .catch(() => { /* keep empty — AgentForm hides the preset select */ });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
        <div>
          <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-accent)]">
            {KIND_LABELS[node.kind] ?? node.kind}
          </span>
          <p className="mt-0.5 font-mono text-[9px] text-neutral-300">{node.id} · ⌫ Del</p>
        </div>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={t("wf.node.deleteNodeLabel")}
            title={t("wf.node.deleteNodeLabel")}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/20 transition"
          >
            <Trash2 size={14} aria-hidden />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {node.kind === "agent" && (
          <AgentForm node={node} onChange={onChange} t={t} suggestions={suggestions} presets={customAgents} />
        )}
        {node.kind === "connector" && (
          <ConnectorForm node={node} onChange={onChange} t={t} connectors={connectors} suggestions={suggestions} />
        )}
        {node.kind === "mcp" && (
          <McpForm node={node} onChange={onChange} t={t} servers={mcpServers} suggestions={suggestions} />
        )}
        {node.kind === "condition" && (
          <ConditionForm node={node} onChange={onChange} t={t} suggestions={suggestions} />
        )}
        {node.kind === "foreach" && (
          <ForeachForm node={node} onChange={onChange} t={t} suggestions={suggestions} connectors={connectors} servers={mcpServers} presets={customAgents} />
        )}
      </div>
    </div>
  );
}
