// Shared chat types (Wave 3). LOCKED by TL prep so the presentational chat
// components (message list, composer, settings, sidebar) and the ChatClient
// orchestrator compose without drift.

import type { ToolTraceItem } from "./toolLabel";
import type { AttachmentMeta } from "@/lib/chat/attachment-meta";
import type { CatalogTool } from "@/lib/chat/toolCatalog";

export type ChatRole = "user" | "assistant";

export type ChatMsg = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt?: number; // epoch ms
  tokensIn?: number; // per-turn prompt tokens (assistant messages)
  tokensOut?: number; // per-turn completion tokens (assistant messages)
  toolTrace?: ToolTraceItem[]; // SP-4: trace tool (ephemeral, không reload)
  cites?: string[];            // SP-4: tên tool nguồn (ephemeral)
  pendingWrite?: PendingWrite; // SP-2 write-gate: card xác nhận (ephemeral)
  attachments?: AttachmentMeta[]; // preview metadata — PERSISTED, hiện lại sau reload
};

// SP-2 write-gate: một hành động write model đề xuất, chờ user xác nhận. title/
// summary/fields do backend cấp (đã redact, code-built). token mờ (đã mã hoá) —
// FE chỉ echo lại, không parse. status do FE quản (ephemeral, reload mất card).
export type PendingWrite = {
  token: string;
  tool: string;
  title: string;
  summary: string;
  fields?: { label: string; value: string }[];
  status: "idle" | "sending" | "done" | "cancelled" | "error";
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
  // W3 vision: raw base64 (không prefix data:) — chỉ ảnh image/* TRONG cap
  // (xem imageCap.ts); gửi lên /api/chat qua body.images song song OCR-text.
  b64?: string;
  // Preview/persistence (xem attachment-meta.ts): thumbnail data URL (ảnh / trang
  // PDF đầu) + mime/size, gửi lên /api/chat để lưu & hiện lại sau reload.
  preview?: string;
  mime?: string;
  size?: number;
};

export type Conv = {
  id: string;
  title: string;
  updatedAt: string | null;
};

// P1 quick-tools: tool user đã chọn từ picker + args đang nhập. Ephemeral —
// gửi kèm /api/chat (body.requestedTool) rồi clear; KHÔNG persist.
export type ToolPick = {
  tool: CatalogTool;
  groupLabel: string;
  args: Record<string, unknown>;
};

export const DEFAULT_SETTINGS: ChatSettings = {
  // Empty until /api/chat/info reports the real deployed model — avoids hardcoding
  // a brand (U2: was "gemma4:e4b" while the host actually runs qwen3). The UI shows
  // a neutral fallback label until it loads; the backend defaults via env if blank.
  model: "",
  temperature: 0.6, // góp ý team: Qwen3-Q8 ổn định nhất ở 0.4–0.7 (giảm lặp từ)
  topP: 0.9,
  system: "",
};
