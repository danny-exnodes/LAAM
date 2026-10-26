import { describe, expect, test } from "vitest";
import { intendedToolName } from "./tool-intent";

// The exact pair from the Cerebras failure: kg_query is a real tool AND a strict prefix of
// kg_query_datasource, so nothing about the name looks wrong. Only the arguments say otherwise.
// `props` defaults to the required set plus project_id — every DAAB tool accepts project_id,
// and the redirect now turns on which tool DECLARES the arguments that were sent.
const tool = (name: string, required: string[], kind = "read", props?: string[]) => ({
  kind,
  type: "function" as const,
  function: {
    name,
    parameters: {
      type: "object",
      properties: Object.fromEntries((props ?? [...required, "project_id"]).map((k) => [k, { type: "string" }])),
      required,
    },
  },
});

const NS = "mcp__daab-pharmacy-chain__";
const kgQuery = tool(NS + "kg_query", ["node_type"]);
const kgQueryDs = tool(NS + "kg_query_datasource", ["natural_language_query", "data_source_id"]);
const kgListDs = tool(NS + "kg_list_datasources", []); // no required fields at all
const TOOLS = [kgQuery, kgQueryDs, kgListDs];

const dsArgs = {
  project_id: "4ad7a5fa",
  data_source_id: "3c7af733",
  natural_language_query: "Which employee refunds the most?",
};

describe("intendedToolName", () => {
  test("kg_query carrying kg_query_datasource's arguments routes to the datasource tool", () => {
    expect(intendedToolName(NS + "kg_query", dsArgs, TOOLS)).toBe(NS + "kg_query_datasource");
  });

  test("same when the provider sends arguments as a JSON string", () => {
    expect(intendedToolName(NS + "kg_query", JSON.stringify(dsArgs), TOOLS)).toBe(NS + "kg_query_datasource");
  });

  // A call that validates is never second-guessed — the model may have meant something we
  // cannot see, and rewriting a working call is strictly worse than leaving it.
  test("leaves a call alone when the named tool's own requirements are met", () => {
    expect(intendedToolName(NS + "kg_query", { node_type: "decision" }, TOOLS)).toBeNull();
  });

  // A tool with no required fields is satisfied by every call ever made; making it eligible
  // would turn it into a magnet for every malformed one.
  test("never routes to a tool that requires nothing", () => {
    expect(intendedToolName(NS + "kg_query", { project_id: "p1" }, TOOLS)).toBeNull();
  });

  // Two candidates means the arguments identify nothing. Guessing between them would produce a
  // confident answer to a question nobody asked — worse than the schema error.
  test("refuses to choose when more than one tool fits", () => {
    const twin = tool(NS + "kg_export_datasource", ["natural_language_query", "data_source_id"]);
    expect(intendedToolName(NS + "kg_query", dsArgs, [...TOOLS, twin])).toBeNull();
  });

  // MEASURED against DAAB's real schemas: these args satisfy the required set of THREE tools —
  // kg_query_datasource, kg_get_master_record (requires only project_id) and kg_list_playbooks
  // (requires only data_source_id). Requiring the candidate to also DECLARE every argument
  // sent leaves exactly one, because natural_language_query exists in no other schema. Without
  // this the rule sees three candidates and declines, which is what it did on the first live
  // run of this fix.
  test("ignores tools that merely satisfy a generic required field but cannot explain the args", () => {
    const master = tool(NS + "kg_get_master_record", ["project_id"]);
    const playbooks = tool(NS + "kg_list_playbooks", ["data_source_id"]);
    const dsFull = tool(NS + "kg_query_datasource", ["natural_language_query", "data_source_id"], "read", [
      "natural_language_query", "data_source_id", "project_id",
    ]);
    expect(intendedToolName(NS + "kg_query", dsArgs, [kgQuery, master, playbooks, dsFull]))
      .toBe(NS + "kg_query_datasource");
  });

  // The redirect must never be the thing that escalates a call across the safety boundary:
  // the write-confirm gate was asked about the tool the model named, not this one.
  test("never crosses the read/write boundary", () => {
    const writer = tool(NS + "kg_insert_datasource_row", ["natural_language_query", "data_source_id"], "write");
    expect(intendedToolName(NS + "kg_query", dsArgs, [kgQuery, writer, kgListDs])).toBeNull();
  });

  test("unknown tool name is left for the safety gate to reject", () => {
    expect(intendedToolName(NS + "nope", dsArgs, TOOLS)).toBeNull();
  });

  test("non-object arguments are left alone", () => {
    expect(intendedToolName(NS + "kg_query", "not json", TOOLS)).toBeNull();
  });
});
