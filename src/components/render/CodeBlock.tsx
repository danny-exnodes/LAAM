"use client";

// A fenced code block: syntax highlighting (react-syntax-highlighter / Prism)
// plus a copy-to-clipboard button. Used by MarkdownView for any non-chart/map
// fenced code.

import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

export function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — leave the button as-is */
    }
  }

  return (
    <div className="chat-code" style={{ position: "relative" }}>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy"
        className="chat-code-copy"
        style={{ position: "absolute", top: 6, right: 6, fontSize: 11 }}
      >
        {copied ? "Đã chép" : "Copy"}
      </button>
      <SyntaxHighlighter
        language={language || "text"}
        style={oneLight}
        customStyle={{ margin: 0, borderRadius: 8, fontSize: 12.5 }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
