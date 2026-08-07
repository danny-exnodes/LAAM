import type { ViewDescriptor } from "@/lib/agent/view";

// One line of the in-page transcript (ConversationLog). Kept in its own module so the
// component and ConstellationClient share the type without importing each other.
//
// `text` is the RAW reply, markdown and all — the transcript renders it through the same
// ChatMarkdown component /chat uses, so both surfaces show the same formatting (bold,
// lists, tables, ```chart). Storing the stripped speech prose instead would make the
// transcript the only place in the app where a reply loses its structure.
//
// Stripping is a SPEECH concern, not a display one: extractForSpeech pulls the blocks out
// of what gets read aloud, and that output is used for TTS only.
// `views` are the code-built tables for THAT turn (Rule 13), stored on the turn rather than
// in one "current turn" state: the transcript is a log, and the next question must not erase
// the table the previous answer was about — which is exactly what a shared state did.
export type Turn = { role: "user" | "assistant"; text: string; views?: ViewDescriptor[] };
