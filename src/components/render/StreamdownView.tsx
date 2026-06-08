"use client";

// SPIKE (2026-06-07, behind NEXT_PUBLIC_CHAT_RENDERER=streamdown) — a drop-in
// alternative to MarkdownView built on `streamdown` (Vercel's AI-streaming
// markdown renderer). Same {source, className} contract so it swaps in via
// ChatMarkdown without touching callers. Goal of the spike: keep the two v1
// special fences (```chart → ChartBlock, ```map → MapBlock) routing correctly
// while letting Streamdown's Shiki own every other fenced block (theme-aware),
// and gain incomplete-block streaming + CJK. See
// docs/superpowers/plans/2026-06-07-streamdown-spike.md.

import { Streamdown, CodeBlock as ShikiCodeBlock, type Components } from "streamdown";
import { ChartBlock } from "./ChartBlock";
import { MapBlock } from "./MapBlock";

// Dual Shiki theme [light, dark]; Streamdown switches on the same `.dark` class
// the app already uses (globals.css @custom-variant), so no JS dark detection.
const SHIKI_THEME: [string, string] = ["github-light", "github-dark"];

// Same interception MarkdownView does: anything with a `language-xxx` class is a
// fenced block. chart/map are routed to our blocks BEFORE Streamdown's code
// plugin; every other fenced block is delegated to Streamdown's own CodeBlock
// (Shiki highlight + copy/download), which reads shikiTheme from context.
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
    return <ShikiCodeBlock code={raw} language={lang} />;
  },
  // Our block components own their wrapper; render <pre> as a passthrough so a
  // lone fence-replacement is not nested inside a <pre> (same as MarkdownView).
  pre(props) {
    return <>{(props as { children?: React.ReactNode }).children}</>;
  },
};

export function StreamdownView({ source, className }: { source: string; className?: string }) {
  return (
    <Streamdown
      className={className}
      shikiTheme={SHIKI_THEME}
      parseIncompleteMarkdown
      components={components}
    >
      {source}
    </Streamdown>
  );
}
