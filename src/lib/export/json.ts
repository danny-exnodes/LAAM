// JSON serializer — pretty-printed (2-space) like v1 public/chat-export.js
// buildJson; falls back to "{}" if the value cannot be stringified.

export function toJson(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return "{}";
  }
}
