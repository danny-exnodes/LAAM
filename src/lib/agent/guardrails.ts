// Guardrail tối thiểu. KHÔNG thêm dependency (tự viết validator).
import type { Tool } from "./types";

type JsonSchema = {
  type?: string;
  properties?: Record<string, { type?: string }>;
  required?: string[];
};

export function validateArgs(
  parameters: object,
  args: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (args != null && typeof args !== "object") return { ok: false, error: "args phải là object" };
  const obj = (args ?? {}) as Record<string, unknown>;
  const schema = (parameters ?? {}) as JsonSchema;
  for (const key of schema.required ?? []) {
    const v = obj[key];
    if (v === undefined || v === null || v === "") return { ok: false, error: `thiếu tham số bắt buộc: ${key}` };
  }
  for (const [key, def] of Object.entries(schema.properties ?? {})) {
    const v = obj[key];
    if (v === undefined || v === null) continue;
    const want = def.type;
    if (!want) continue;
    const okType =
      (want === "string" && typeof v === "string") ||
      (want === "number" && typeof v === "number") ||
      (want === "boolean" && typeof v === "boolean") ||
      (want === "array" && Array.isArray(v)) ||
      (want === "object" && typeof v === "object" && !Array.isArray(v));
    if (!okType) return { ok: false, error: `tham số ${key} phải là ${want}` };
  }
  return { ok: true, value: obj };
}

export function boundOutput(result: unknown, maxBytes = 8192): unknown {
  let json: string;
  try {
    json = JSON.stringify(result);
  } catch {
    return { error: "kết quả không serialize được" };
  }
  if (json == null || json.length <= maxBytes) return result;
  return { _truncated: true, preview: json.slice(0, maxBytes) };
}

export function guard(tool: Tool): Tool {
  return {
    ...tool,
    handler: async (args, ctx) => {
      const v = validateArgs(tool.parameters, args);
      if (!v.ok) return { error: v.error };
      const out = await tool.handler(v.value, ctx);
      return boundOutput(out);
    },
  };
}
