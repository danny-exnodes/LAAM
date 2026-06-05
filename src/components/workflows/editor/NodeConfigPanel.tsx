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

import { useState, useEffect } from "react";
import type { WfNode, WfAgentNode, WfConnectorNode, WfConditionNode, WfForeachNode, Predicate, WorkflowGraph } from "@/lib/workflow/types";

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
}: {
  node: WfAgentNode;
  onChange: (n: WfNode) => void;
}) {
  return (
    <>
      {field(
        <>
          {label("System prompt")}
          <textarea
            className={inputCls()}
            rows={3}
            value={node.system ?? ""}
            placeholder="(dùng mặc định harness)"
            onChange={(e) => onChange({ ...node, system: e.target.value || undefined })}
          />
        </>,
      )}
      {field(
        <>
          {label("Prompt *")}
          <textarea
            className={inputCls()}
            rows={4}
            value={node.prompt}
            placeholder="Nhập prompt — {{var}} để nội suy"
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
}: {
  node: WfConnectorNode;
  onChange: (n: WfNode) => void;
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
      setArgsError("JSON không hợp lệ");
    }
  }

  return (
    <>
      {field(
        <>
          {label("Connector ID *")}
          <input
            type="text"
            className={inputCls()}
            value={node.connectorId}
            placeholder="vd: trello, github, slack"
            onChange={(e) => onChange({ ...node, connectorId: e.target.value })}
          />
        </>,
      )}
      {field(
        <>
          {label("Action *")}
          <input
            type="text"
            className={inputCls()}
            value={node.action}
            placeholder="vd: demo_list_tasks"
            onChange={(e) => onChange({ ...node, action: e.target.value })}
          />
        </>,
      )}
      {field(
        <>
          {label("Args (JSON)")}
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
}: {
  node: WfConditionNode;
  onChange: (n: WfNode) => void;
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
      setParseError("JSON không hợp lệ");
    }
  }

  return (
    <>
      {field(
        <>
          {label("Điều kiện (Predicate JSON)")}
          <textarea
            className={inputCls(!!parseError)}
            rows={6}
            value={text}
            placeholder={'{\n  "left": "{{steps.n1.output.count}}",\n  "op": "gt",\n  "right": 0\n}'}
            onChange={(e) => handleChange(e.target.value)}
          />
          {parseError && errorMsg(parseError)}
          <p className="mt-1 text-xs text-neutral-400">
            op: eq|ne|gt|lt|gte|lte|contains|not_contains|exists|not_exists · all/any cho nhóm
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
}: {
  node: WfForeachNode;
  onChange: (n: WfNode) => void;
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
      setBodyError("JSON không hợp lệ");
    }
  }

  return (
    <>
      {field(
        <>
          {label("Items (template)")}
          <input
            type="text"
            className={inputCls()}
            value={node.items}
            placeholder="{{steps.n1.output.items}}"
            onChange={(e) => onChange({ ...node, items: e.target.value })}
          />
          <p className="mt-1 text-xs text-neutral-400">
            Phải resolve thành array lúc chạy
          </p>
        </>,
      )}
      {field(
        <>
          {label("Body graph (JSON)")}
          <textarea
            className={inputCls(!!bodyError)}
            rows={8}
            value={bodyText}
            placeholder={'{\n  "nodes": [...],\n  "edges": [...]\n}'}
            onChange={(e) => handleBodyChange(e.target.value)}
          />
          {bodyError && errorMsg(bodyError)}
          <p className="mt-1 text-xs text-neutral-400">
            Mỗi item được truyền qua context {"{{item}}"} khi chạy body.
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
}: {
  node: WfNode;
  onChange: (updated: WfNode) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
        <div>
          <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-accent)]">
            {KIND_LABELS[node.kind] ?? node.kind}
          </span>
          <p className="mt-0.5 text-xs text-neutral-400 font-mono">{node.id}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {node.kind === "agent" && (
          <AgentForm node={node} onChange={onChange} />
        )}
        {node.kind === "connector" && (
          <ConnectorForm node={node} onChange={onChange} />
        )}
        {node.kind === "condition" && (
          <ConditionForm node={node} onChange={onChange} />
        )}
        {node.kind === "foreach" && (
          <ForeachForm node={node} onChange={onChange} />
        )}
      </div>
    </div>
  );
}
