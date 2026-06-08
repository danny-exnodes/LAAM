"use client";

// SPIKE switch (2026-06-07): picks the chat markdown renderer by build-time flag
// NEXT_PUBLIC_CHAT_RENDERER. Default (unset/anything else) = MarkdownView
// (react-markdown, the shipped path — untouched). "streamdown" = StreamdownView.
// Drop-in {source, className} so MessageItem swaps one import. Keeps both paths
// alive per the spike decision (no migration yet) — see
// docs/superpowers/plans/2026-06-07-streamdown-spike.md.

import dynamic from "next/dynamic";
import { MarkdownView } from "./MarkdownView";

const USE_STREAMDOWN = process.env.NEXT_PUBLIC_CHAT_RENDERER === "streamdown";

// Lazy-load the streamdown stack ONLY when the flag selects it. USE_STREAMDOWN is
// a build-time constant, so when it's false the bundler dead-code-eliminates the
// import() below and the default path never ships streamdown/shiki. ssr:false —
// same heavy-render pattern as MapBlock (leaflet).
const StreamdownView = USE_STREAMDOWN
  ? dynamic(() => import("./StreamdownView").then((m) => m.StreamdownView), { ssr: false })
  : null;

export function ChatMarkdown(props: { source: string; className?: string }) {
  if (USE_STREAMDOWN && StreamdownView) return <StreamdownView {...props} />;
  return <MarkdownView {...props} />;
}
