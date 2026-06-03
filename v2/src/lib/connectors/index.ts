// Connector framework — public API (STUB; the `framework` agent implements).
// All functions are USER-SCOPED. Credentials are read/written via store.ts
// (encrypted at rest) and connectors come from registry.ts. See types.ts for
// the locked contracts and docs/superpowers/plans/2026-06-03-v2-wave4-connectors.md.

import type { ConnectorListItem, ConnectorTool } from "./types";

const NOT_IMPL = "connector framework not implemented yet";

export async function list(_userId: string): Promise<ConnectorListItem[]> {
  throw new Error(NOT_IMPL);
}

export async function isConnected(_userId: string, _id: string): Promise<boolean> {
  throw new Error(NOT_IMPL);
}

export async function connect(
  _userId: string,
  _id: string,
  _fields: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  throw new Error(NOT_IMPL);
}

export async function disconnect(_userId: string, _id: string): Promise<{ ok: boolean }> {
  throw new Error(NOT_IMPL);
}

export async function testConnector(
  _userId: string,
  _id: string,
): Promise<{ ok: boolean; info?: string; error?: string }> {
  throw new Error(NOT_IMPL);
}

export async function chatTools(_userId: string): Promise<ConnectorTool[]> {
  throw new Error(NOT_IMPL);
}

export async function execute(
  _userId: string,
  _toolName: string,
  _args: unknown,
): Promise<unknown> {
  throw new Error(NOT_IMPL);
}
