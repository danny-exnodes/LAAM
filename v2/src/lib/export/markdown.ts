// Conversation → Markdown — ports the section shape from v1 public/chat-export.js
// buildMarkdown: each message becomes `**<Role>:**\n\n<content>`, sections joined
// by a horizontal rule. Code fences inside content pass through verbatim.

// Vietnamese role labels (mirrors chat-export.js roleLabel; defaults to the raw role).
function roleLabel(role: string): string {
  if (role === "user") return "Bạn";
  if (role === "assistant") return "Trợ lý";
  return role;
}

export function toMarkdown(conversation: { role: string; content: string }[]): string {
  if (!conversation.length) return "";
  return conversation
    .map((m) => "**" + roleLabel(m.role) + ":**\n\n" + (m.content ?? ""))
    .join("\n\n---\n\n");
}
