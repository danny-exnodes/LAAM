// Shared chat types (Wave 3). LOCKED by TL prep so the presentational chat
// components (message list, composer, settings, sidebar) and the ChatClient
// orchestrator compose without drift.

export type ChatRole = "user" | "assistant";

export type ChatMsg = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt?: number; // epoch ms
};

export type ChatSettings = {
  model: string;
  temperature: number;
  topP: number;
  system: string;
};

// An ingested attachment: its extracted text is what gets fed to the model.
export type Attachment = {
  id: string;
  name: string;
  kind: "file" | "url" | "image";
  chars: number;
  text: string;
};

export type Conv = {
  id: string;
  title: string;
  updatedAt: string | null;
};

export const DEFAULT_SETTINGS: ChatSettings = {
  model: "gemma4:e4b",
  temperature: 0.7,
  topP: 0.9,
  system: "",
};
