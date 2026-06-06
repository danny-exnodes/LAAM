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
import type { WfNode, WfAgentNode, WfConnectorNode, WfConditionNode, WfForeachNode, Predicate, WorkflowGraph } from "@/lib/workflow/types";
import { useT } from "@/i18n/provider";
import { workflows as dict } from "@/i18n/dictionaries/workflows";
import type { Translator } from "@/i18n/types";
import type { ConnectorListItem } from "@/lib/connectors/types";

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

// ── Agent form ──────────────────────────────────────────────────────────────

function AgentForm({
  node,
  onChange,
  t,
}: {
  node: WfAgentNode;
  onChange: (n: WfNode) => void;
  t: Translator;
}) {
  return (
    <>
      {field(
        <>
          {label(t("wf.node.agent.systemLabel"))}
          <textarea
            className={inputCls()}
            rows={3}
            value={node.system ?? ""}
            placeholder={t("wf.node.agent.systemPlaceholder")}
            onChange={(e) => onChange({ ...node, system: e.target.value || undefined })}
          />
        </>,
      )}
      {field(
        <>
          {label(t("wf.node.agent.promptLabel"))}
          <textarea
            className={inputCls()}
            rows={4}
            value={node.prompt}
            placeholder={t("wf.node.agent.promptPlaceholder")}
            onChange={(e) => onChange({ ...node, prompt: e.target.value })}
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
}: {
  node: WfConnectorNode;
  onChange: (n: WfNode) => void;
  t: Translator;
  connectors: ConnectorListItem[];
}) {
  const [argsText, setArgsText] = useState(
    Object.keys(node.args).length ? JSON.stringify(node.args, null, 2) : "",
  );
  const [argsError, setArgsError] = useState<string | null>(null);

  // Sync argsText when node.args changes externally (e.g. initial load)
  useEffect(() => {
    setArgsText(Object.keys(node.args).length ? JSON.stringify(node.args, null, 2) : "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  function handleArgsChange(raw: string) {
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

  const selectedConnector = connectors.find((c) => c.id === node.connectorId) ?? null;
  const availableActions = selectedConnector?.tools ?? [];
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
                onChange={(e) => onChange({ ...node, action: e.target.value })}
              >
                <option value="">{t("wf.node.connector.selectAction")}</option>
                {availableActions.map((a) => (
                  <option key={a} value={a}>{a}</option>
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
        <>
          {label(t("wf.node.connector.argsLabel"))}
          <textarea
            className={inputCls(!!argsError)}
            rows={5}
            value={argsText}
            placeholder={'{\n  "key": "{{var}}"\n}'}
            onChange={(e) => handleArgsChange(e.target.value)}
          />
          {argsError && errorMsg(argsError)}
        </>,
      )}
    </>
  );
}

// ── Condition form ──────────────────────────────────────────────────────────

function ConditionForm({
  node,
  onChange,
  t,
}: {
  node: WfConditionNode;
  onChange: (n: WfNode) => void;
  t: Translator;
}) {
  const [text, setText] = useState(JSON.stringify(node.when, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);

  function handleChange(raw: string) {
    setText(raw);
    try {
      const parsed = JSON.parse(raw) as Predicate;
      setParseError(null);
      onChange({ ...node, when: parsed });
    } catch {
      setParseError(t("wf.node.jsonInvalid"));
    }
  }

  return (
    <>
      {field(
        <>
          {label(t("wf.node.condition.label"))}
          <textarea
            className={inputCls(!!parseError)}
            rows={6}
            value={text}
            placeholder={'{\n  "left": "{{steps.n1.output.count}}",\n  "op": "gt",\n  "right": 0\n}'}
            onChange={(e) => handleChange(e.target.value)}
          />
          {parseError && errorMsg(parseError)}
          <p className="mt-1 text-xs text-neutral-400">
            {t("wf.node.condition.hint")}
          </p>
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
}: {
  node: WfForeachNode;
  onChange: (n: WfNode) => void;
  t: Translator;
}) {
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
            type="text"
            className={inputCls()}
            value={node.items}
            placeholder="{{steps.n1.output.items}}"
            onChange={(e) => onChange({ ...node, items: e.target.value })}
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
}: {
  node: WfNode;
  onChange: (updated: WfNode) => void;
  onDelete?: () => void;
  /** Injected for tests; if omitted, fetched from /api/connectors on mount */
  connectors?: ConnectorListItem[];
}) {
  // t is called here (top-level component) and passed to sub-forms as a prop,
  // since sub-forms are local functions and cannot call hooks directly.
  const t = useT(dict);
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
          <AgentForm node={node} onChange={onChange} t={t} />
        )}
        {node.kind === "connector" && (
          <ConnectorForm node={node} onChange={onChange} t={t} connectors={connectors} />
        )}
        {node.kind === "condition" && (
          <ConditionForm node={node} onChange={onChange} t={t} />
        )}
        {node.kind === "foreach" && (
          <ForeachForm node={node} onChange={onChange} t={t} />
        )}
      </div>
    </div>
  );
}
