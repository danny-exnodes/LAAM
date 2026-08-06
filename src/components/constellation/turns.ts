// One line of the in-page transcript (ConversationLog). Kept in its own module so the
// component and ConstellationClient share the type without importing each other.
//
// `text` is the SPOKEN prose, not the raw reply: extractForSpeech has already pulled the
// table/chart blocks out (they render on DisplayPanel). Storing the raw markdown here
// would put pipe-table syntax in the transcript, which is exactly what the voice path
// exists to avoid.
export type Turn = { role: "user" | "assistant"; text: string };
