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
import type { WfNode, WfAgentNode, WfConnectorNode, WfConditionNode, WfForeachNode, Predicate, WorkflowGraph, Op, Comparator } from "@/lib/workflow/types";
import { useT } from "@/i18n/provider";
import { workflows as dict } from "@/i18n/dictionaries/workflows";
import type { Translator } from "@/i18n/types";
import type { ConnectorListItem } from "@/lib/connectors/types";
import { variableSuggestions } from "./variableHints";
import { parseArgSchema, type ArgField } from "./schemaForm";

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
}: {
  node: WfAgentNode;
  onChange: (n: WfNode) => void;
  t: Translator;
  suggestions: string[];
}) {
  const systemRef = useRef<HTMLTextAreaElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  return (
    <>
      {field(
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
  node: WfConnectorNode;
  onChange: (n: WfNode) => void;
  t: Translator;
  suggestions: string[];
  schema: object | null;
}) {
  const { fields, propCount, flat } = parseArgSchema(schema);
  const [advanced, setAdvanced] = useState(!flat);
  const [argsText, setArgsText] = useState(
    Object.keys(node.args).length ? JSON.stringify(node.args, null, 2) : "",
  );
  const [argsError, setArgsError] = useState<string | null>(null);

  // Re-seed raw text + default mode when the node or the selected action changes.
  useEffect(() => {
    setArgsText(Object.keys(node.args).length ? JSON.stringify(node.args, null, 2) : "");
    setAdvanced(!flat);
    setArgsError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id, node.action]);

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
  node: WfConnectorNode;
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

// All comparison operators supported by the engine
const OPS: { value: Op; label: string }[] = [
  { value: "eq", label: "= (eq)" },
  { value: "ne", label: "≠ (ne)" },
  { value: "gt", label: "> (gt)" },
  { value: "lt", label: "< (lt)" },
  { value: "gte", label: "≥ (gte)" },
  { value: "lte", label: "≤ (lte)" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "not_contains" },
  { value: "exists", label: "exists" },
  { value: "not_exists", label: "not_exists" },
];

function isSimpleComparator(p: Predicate): p is Comparator {
  return "op" in p;
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
  const simple = isSimpleComparator(node.when);
  const [mode, setMode] = useState<"form" | "json">(simple ? "form" : "json");

  // Structured-form local state
  const [left, setLeft] = useState(simple ? (node.when as Comparator).left : "");
  const [op, setOp] = useState<Op>(simple ? (node.when as Comparator).op : "eq");
  const [right, setRight] = useState(simple ? String((node.when as Comparator).right ?? "") : "");

  // JSON-mode local state
  const [jsonText, setJsonText] = useState(JSON.stringify(node.when, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);

  // Sync local state when a different node is selected (node.id changes)
  useEffect(() => {
    const s = isSimpleComparator(node.when);
    if (s) {
      const c = node.when as Comparator;
      setLeft(c.left);
      setOp(c.op);
      setRight(String(c.right ?? ""));
    }
    setJsonText(JSON.stringify(node.when, null, 2));
    setParseError(null);
    setMode(s ? "form" : "json");
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
    setMode("json");
  }

  function switchToForm() {
    if (isSimpleComparator(node.when)) {
      const c = node.when as Comparator;
      setLeft(c.left);
      setOp(c.op);
      setRight(String(c.right ?? ""));
      setMode("form");
    }
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

  const modeSwitcher = (
    <div className="mb-3 flex justify-end">
      {mode === "form" ? (
        <button
          type="button"
          onClick={switchToJson}
          className="text-xs text-neutral-400 transition hover:text-neutral-600 dark:hover:text-neutral-200"
        >
          {t("wf.node.condition.jsonMode")} ↗
        </button>
      ) : isSimpleComparator(node.when) ? (
        <button
          type="button"
          onClick={switchToForm}
          className="text-xs text-neutral-400 transition hover:text-neutral-600 dark:hover:text-neutral-200"
        >
          {t("wf.node.condition.formMode")} ↗
        </button>
      ) : null}
    </div>
  );

  if (mode === "form") {
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
}: {
  node: WfForeachNode;
  onChange: (n: WfNode) => void;
  t: Translator;
  suggestions: string[];
}) {
  const itemsRef = useRef<HTMLInputElement>(null);
  const [bodyText, setBodyText] = useState(JSON.stringify(node.body, null, 2));
  const [bodyError, setBodyError] = useState<string | null>(null);

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
          <p className="mt-1 text-xs text-neutral-400">
            {t("wf.node.foreach.itemsHint")}
          </p>
        </>,
      )}
      {field(
        <>
          {label(t("wf.node.foreach.bodyLabel"))}
          <textarea
            className={inputCls(!!bodyError)}
            rows={8}
            value={bodyText}
            placeholder={'{\n  "nodes": [...],\n  "edges": [...]\n}'}
            onChange={(e) => handleBodyChange(e.target.value)}
          />
          {bodyError && errorMsg(bodyError)}
          <p className="mt-1 text-xs text-neutral-400">
            {t("wf.node.foreach.bodyHint")}
          </p>
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
};

export function NodeConfigPanel({
  node,
  onChange,
  onDelete,
  connectors: connectorsProp,
  allNodes,
  edges,
}: {
  node: WfNode;
  onChange: (updated: WfNode) => void;
  onDelete?: () => void;
  /** Injected for tests; if omitted, fetched from /api/connectors on mount */
  connectors?: ConnectorListItem[];
  /** All graph nodes — used to derive upstream {{steps.<id>.output}} variables. */
  allNodes?: WfNode[];
  /** Edges (source→target) — used to compute which nodes are upstream of this one. */
  edges?: ReadonlyArray<{ source: string; target: string }>;
}) {
  // t is called here (top-level component) and passed to sub-forms as a prop,
  // since sub-forms are local functions and cannot call hooks directly.
  const t = useT(dict);
  const suggestions = variableSuggestions(allNodes ?? [], edges ?? [], node.id);
  const [connectors, setConnectors] = useState<ConnectorListItem[]>(connectorsProp ?? []);

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
          <AgentForm node={node} onChange={onChange} t={t} suggestions={suggestions} />
        )}
        {node.kind === "connector" && (
          <ConnectorForm node={node} onChange={onChange} t={t} connectors={connectors} suggestions={suggestions} />
        )}
        {node.kind === "condition" && (
          <ConditionForm node={node} onChange={onChange} t={t} suggestions={suggestions} />
        )}
        {node.kind === "foreach" && (
          <ForeachForm node={node} onChange={onChange} t={t} suggestions={suggestions} />
        )}
      </div>
    </div>
  );
}
