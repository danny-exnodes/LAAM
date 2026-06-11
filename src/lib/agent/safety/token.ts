// Seal a pending write into an opaque, tamper-evident token the client echoes
// back to confirm. Reuses lib/connectors/crypto (AES-256-GCM) → integrity (GCM
// auth tag) AND confidentiality (args invisible to the client). Stateless: no DB
// row. (Spec §5.)
import { encryptJson, decryptJson } from "@/lib/connectors/crypto";

export type PendingWrite = {
  v: 1;
  name: string;
  args: Record<string, unknown>;
  conversationId: string;
  userId: string;
  iat: number; // epoch ms
  exp: number; // epoch ms
  nonce: string;
  // C1 (additive, optional): model của lượt gốc — confirm narrate bằng đúng model
  // (claude → adapter, còn lại → Ollama). Token cũ không có field vẫn mở được.
  model?: string;
};

export function sealPendingWrite(p: PendingWrite): string {
  return encryptJson(p);
}

export function openPendingWrite(
  token: string,
  now: number,
): { ok: true; value: PendingWrite } | { ok: false; error: string } {
  let p: PendingWrite;
  try {
    p = decryptJson<PendingWrite>(token);
  } catch {
    return { ok: false, error: "token không hợp lệ" };
  }
  if (p?.v !== 1 || typeof p.exp !== "number" || typeof p.name !== "string") {
    return { ok: false, error: "token sai định dạng" };
  }
  if (now > p.exp) return { ok: false, error: "token đã hết hạn" };
  return { ok: true, value: p };
}
