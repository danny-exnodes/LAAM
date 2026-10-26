"use client";

// Sanitized rich Markdown renderer for assistant messages — the v2 counterpart
// of v1's public/chat-render.js. react-markdown + remark-gfm (tables) +
// rehype-sanitize (XSS gate). A custom `code` renderer intercepts the two v1
// special fences: ```chart → ChartBlock, ```map → MapBlock; every other fenced
// block → CodeBlock (highlight + copy). Inline code stays a plain <code>.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { Components } from "react-markdown";
import { ChartBlock } from "./ChartBlock";
import { MapBlock } from "./MapBlock";
import { CodeBlock } from "./CodeBlock";

// react-markdown passes block code with a `language-xxx` className and inline
// code without one. We treat anything with a language class as a fenced block.
const components: Components = {
  code(props) {
    const { className, children } = props as { className?: string; children?: React.ReactNode };
    const match = /language-(\w+)/.exec(className || "");
    if (!match) {
      return <code className={className}>{children}</code>;
    }
    const lang = match[1].toLowerCase();
    const raw = String(children ?? "").replace(/\n$/, "");
    if (lang === "chart") return <ChartBlock raw={raw} />;
    if (lang === "map") return <MapBlock raw={raw} />;
    return <CodeBlock code={raw} language={lang} />;
  },
  // ChartBlock/MapBlock are block elements; React errors if they nest in a <p>
  // (which react-markdown wraps a lone fence-replacement in). Render <pre> as a
  // passthrough so our custom code components own their own wrapper.
  pre(props) {
    return <>{(props as { children?: React.ReactNode }).children}</>;
  },
  // Wrap tables in an overflow-x container so a wide table (e.g. a financial
  // breakdown) scrolls inside the message instead of overflowing it. Styling
  // lives in .chat-md / .chat-md-tablewrap (globals.css).
  table(props) {
    return (
      <div className="chat-md-tablewrap">
        <table>{(props as { children?: React.ReactNode }).children}</table>
      </div>
    );
  },
};

export function MarkdownView({ source, className }: { source: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
