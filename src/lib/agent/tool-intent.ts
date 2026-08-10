// A tool call whose NAME says one tool and whose ARGUMENTS say another.
//
// Measured 2026-08-10: the same question, same tool list, same prompt, answered correctly on
// gpt-oss-120b via BytePlus and failed on gpt-oss-120b via Cerebras. Cerebras emitted
//
//   name: mcp__<slug>__kg_query
//   args: { project_id, data_source_id, natural_language_query }
//
// natural_language_query and data_source_id exist only in kg_query_datasource's schema, so the
// model had that tool and knew what to send — it wrote the neighbouring, shorter name, which
// happens to be a real registered tool and a strict prefix of the intended one. The call was
// dispatched, rejected with "[node_type] required field is missing", and the turn spent five
// rounds guessing at kg_query's schema before answering "no refund data was returned".
//
// The name is provider-quality and cannot be fixed from here. The MISTAKE can: the arguments
// identify the intended tool on their own, mechanically, with no model cooperation and no
// provider-specific knowledge. That is the whole idea — every other lever tried on this class
// of problem ended with an instruction the model chose to ignore.
//
// PURE — no I/O, no model calls (Rule 5).

type ToolLike = {
  kind?: string;
  function?: { name?: string; parameters?: unknown };
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

// Args arrive as an object from most providers and as a JSON string from some.
function argKeys(args: unknown): Set<string> | null {
  let v = args;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!isRecord(v)) return null;
  return new Set(Object.keys(v));
}

// `required` off a JSON-Schema parameters object. Anything else reads as "no requirements",
// which the caller treats as a tool that must never be a redirect target.
function requiredOf(tool: ToolLike): string[] {
  const p = tool.function?.parameters;
  if (!isRecord(p)) return [];
  const req = p.required;
  return Array.isArray(req) ? req.filter((x): x is string => typeof x === "string") : [];
}

// Every parameter the tool DECLARES, required or not.
function propertiesOf(tool: ToolLike): Set<string> {
  const p = tool.function?.parameters;
  if (!isRecord(p) || !isRecord(p.properties)) return new Set();
  return new Set(Object.keys(p.properties));
}

const satisfiedBy = (required: string[], keys: Set<string>) =>
  required.length > 0 && required.every((r) => keys.has(r));

// The tool ACCOUNTS FOR the call when it declares every argument that was sent. This is the
// discriminating test, and "required fields are present" alone is not: measured against DAAB's
// real schemas, the args {project_id, data_source_id, natural_language_query} satisfy the
// required set of THREE tools — kg_query_datasource, but also kg_get_master_record (requires
// only project_id) and kg_list_playbooks (requires only data_source_id). Both of those would
// leave natural_language_query unexplained, and that argument is precisely the evidence of
// intent. Demanding the tool account for every argument narrows the same call to exactly one.
const accountsFor = (tool: ToolLike, keys: Set<string>) => {
  const props = propertiesOf(tool);
  if (props.size === 0) return false; // no declared schema: explains nothing
  for (const k of keys) if (!props.has(k)) return false;
  return true;
};

// Returns the name of the tool the ARGUMENTS point at, or null to leave the call alone.
//
// Deliberately narrow — four conditions, all required:
//   1. the named tool's own required fields are NOT all present (a call that validates is
//      never second-guessed, however odd it looks);
//   2. exactly ONE other tool both has its full required set present AND declares every
//      argument that was sent. Two candidates means the args identify nothing and guessing
//      would be worse than the error;
//   3. that tool declares at least one required field. A tool with none is satisfied by every
//      call ever made and would become a magnet for every malformed one;
//   4. it has the same kind as the tool that was named. Rewriting a call across the read/write
//      boundary would let a garbled name reach a tool the safety gate was never asked about —
//      the redirect must never be the thing that escalates a call.
export function intendedToolName(
  calledName: string,
  args: unknown,
  tools: readonly ToolLike[],
): string | null {
  const keys = argKeys(args);
  if (!keys) return null;

  const called = tools.find((t) => t.function?.name === calledName);
  if (!called) return null; // unknown tool: not this module's problem, the gate fails closed
  if (requiredOf(called).length === 0) return null;
  if (satisfiedBy(requiredOf(called), keys) && accountsFor(called, keys)) return null;

  const candidates = tools.filter(
    (t) =>
      t.function?.name !== calledName &&
      t.kind === called.kind &&
      satisfiedBy(requiredOf(t), keys) &&
      accountsFor(t, keys),
  );
  if (candidates.length !== 1) return null;
  return candidates[0].function?.name ?? null;
}
