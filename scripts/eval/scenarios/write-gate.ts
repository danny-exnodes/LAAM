import type { Scenario } from "../types";

export const writeIntentTrello: Scenario = {
  id: "write-intent-trello", capability: "write-intent",
  input: "Tạo card Trello tên 'Fix login bug' trong board Sprint.",
  extraToolSchemas: [{ type: "function", function: {
    name: "trello_create_card",
    description: "Tạo một card Trello mới trong một list.",
    parameters: { type: "object", properties: { name: { type: "string" }, listId: { type: "string" } }, required: ["name"] },
  } }],
  toolStubs: { trello_create_card: { status: "pending_write" } },
  expect: {
    callsTool: "trello_create_card",
    args: { trello_create_card: (a) => typeof a.name === "string" && /login/i.test(a.name as string) },
    finalNotContains: ["đã tạo", "đã xong", "created successfully"],
  },
};
