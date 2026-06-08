// schemaForm.ts — PURE. Parses a connector tool's JSON-schema `parameters` into a
// flat list of form fields for SchemaArgsForm. Non-flat schemas (nested objects,
// arrays, unknown types) are reported via `flat=false` so the caller falls back to
// the raw-JSON "Advanced" editor — we never half-render a shape we can't round-trip.

export type ArgFieldKind = "string" | "number" | "boolean" | "enum";

export type ArgField = {
  key: string;
  kind: ArgFieldKind;
  description?: string;
  required: boolean;
  enumValues?: string[]; // present iff kind === "enum"
};

type PropSchema = { type?: string; description?: string; enum?: unknown[] };
type ObjectSchema = { type?: string; properties?: Record<string, PropSchema>; required?: string[] };

export type ParsedArgSchema = {
  fields: ArgField[]; // the renderable (scalar/enum) properties, in declaration order
  propCount: number; //  total properties declared (0 if none / not an object schema)
  flat: boolean; //       true ⟺ every property is renderable (no raw JSON needed)
};

export function parseArgSchema(schema: unknown): ParsedArgSchema {
  const s = schema as ObjectSchema | null | undefined;
  if (!s || s.type !== "object" || !s.properties || typeof s.properties !== "object") {
    return { fields: [], propCount: 0, flat: false };
  }
  const required = new Set(Array.isArray(s.required) ? s.required.map(String) : []);
  const entries = Object.entries(s.properties);
  const fields: ArgField[] = [];
  for (const [key, prop] of entries) {
    const p: PropSchema = prop ?? {};
    let kind: ArgFieldKind | null = null;
    let enumValues: string[] | undefined;
    if (Array.isArray(p.enum) && p.enum.length > 0) {
      kind = "enum";
      enumValues = p.enum.map((v) => String(v));
    } else if (p.type === "string") {
      kind = "string";
    } else if (p.type === "number" || p.type === "integer") {
      kind = "number";
    } else if (p.type === "boolean") {
      kind = "boolean";
    }
    if (kind === null) continue; // array / object / unknown → not flat-renderable
    fields.push({ key, kind, description: p.description, required: required.has(key), enumValues });
  }
  const propCount = entries.length;
  return { fields, propCount, flat: propCount > 0 && fields.length === propCount };
}
