"use client";

// SPIKE switch (2026-06-07): picks the chat markdown renderer by build-time flag
// NEXT_PUBLIC_CHAT_RENDERER. Default (unset/anything else) = MarkdownView
// (react-markdown, the shipped path — untouched). "streamdown" = StreamdownView.
// Drop-in {source, className} so MessageItem swaps one import. Keeps both paths
// alive per the spike decision (no migration yet) — see
// docs/superpowers/plans/2026-06-07-streamdown-spike.md.

import { MarkdownView } from "./MarkdownView";
import { StreamdownView } from "./StreamdownView";

const USE_STREAMDOWN = process.env.NEXT_PUBLIC_CHAT_RENDERER === "streamdown";

export function ChatMarkdown(props: { source: string; className?: string }) {
  return USE_STREAMDOWN ? <StreamdownView {...props} /> : <MarkdownView {...props} />;
}
