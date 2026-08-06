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
export type Turn = { role: "user" | "assistant"; text: string };
