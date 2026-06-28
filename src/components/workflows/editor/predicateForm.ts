/**
 * predicateForm.ts — PURE (no side effects, no eval, no React).
 *
 * Immutable round-trip helpers for editing a condition node's `Predicate` tree
 * in a structured all/any builder. The engine already evaluates compound
 * predicates recursively (src/lib/workflow/predicate.ts), but the editor only
 * had a friendly form for a single Comparator and dropped any all/any group to
 * a raw-JSON textarea. These helpers let the UI build/edit the tree directly
 * while keeping the raw-JSON "Advanced" toggle as an escape hatch.
 *
 * A `Path` is an array of child indices navigating into nested groups
 * (`[]` = root, `[1]` = the root group's 2nd child, `[1,0]` = its 1st child…).
 * Every helper returns a NEW predicate and never mutates its input.
 */
import type { Predicate, Comparator, Op } from "@/lib/workflow/types";

export type Path = number[];
type Group = { all: Predicate[] } | { any: Predicate[] };

/** Canonical op list — the SINGLE source the engine Op union and the UI both use. */
export const PREDICATE_OPS: Op[] = [
  "eq",
  "ne",
  "gt",
  "lt",
  "gte",
  "lte",
  "contains",
  "not_contains",
  "exists",
  "not_exists",
];

export function emptyComparator(): Comparator {
  return { left: "", op: "eq", right: "" };
}

export function isGroup(p: Predicate): p is Group {
  return typeof p === "object" && p !== null && ("all" in p || "any" in p);
}

export function groupMode(p: Predicate): "all" | "any" | null {
  if (!isGroup(p)) return null;
  return "all" in p ? "all" : "any";
}

export function groupChildren(p: Predicate): Predicate[] {
  if (!isGroup(p)) return [];
  return "all" in p ? p.all : (p as { any: Predicate[] }).any;
}

function makeGroup(mode: "all" | "any", children: Predicate[]): Group {
  return mode === "all" ? { all: children } : { any: children };
}

/** Replace the predicate at `path` with `fn(node)`. No-op on an invalid path. */
function mapAt(pred: Predicate, path: Path, fn: (p: Predicate) => Predicate): Predicate {
  if (path.length === 0) return fn(pred);
  if (!isGroup(pred)) return pred;
  const [head, ...rest] = path;
  const mode = groupMode(pred)!;
  const children = groupChildren(pred).map((c, i) => (i === head ? mapAt(c, rest, fn) : c));
  return makeGroup(mode, children);
}

/** The predicate at `path`, or null if the path is invalid (out of range / into a comparator). */
export function getAt(pred: Predicate, path: Path): Predicate | null {
  let cur: Predicate = pred;
  for (const i of path) {
    if (!isGroup(cur)) return null;
    const children = groupChildren(cur);
    if (i < 0 || i >= children.length) return null;
    cur = children[i];
  }
  return cur;
}

/** Switch the ROOT predicate's grouping: wrap a lone comparator, or re-key a group. */
export function setMode(pred: Predicate, mode: "all" | "any"): Predicate {
  if (isGroup(pred)) return makeGroup(mode, groupChildren(pred));
  return makeGroup(mode, [pred]);
}

/** Switch the all/any mode of the group at `path` (path-aware setMode). */
export function setModeAt(pred: Predicate, path: Path, mode: "all" | "any"): Predicate {
  return mapAt(pred, path, (p) => (isGroup(p) ? makeGroup(mode, groupChildren(p)) : setMode(p, mode)));
}

/** Append an empty comparator to the group at `path`. */
export function addComparator(pred: Predicate, path: Path = []): Predicate {
  return mapAt(pred, path, (p) =>
    isGroup(p) ? makeGroup(groupMode(p)!, [...groupChildren(p), emptyComparator()]) : p,
  );
}

/** Append a nested group (seeded with one empty comparator) to the group at `path`. */
export function addGroup(pred: Predicate, path: Path = [], mode: "all" | "any" = "all"): Predicate {
  return mapAt(pred, path, (p) =>
    isGroup(p)
      ? makeGroup(groupMode(p)!, [...groupChildren(p), makeGroup(mode, [emptyComparator()])])
      : p,
  );
}

/** Remove the child addressed by `path` (its last index) from its parent group. */
export function removeBranch(pred: Predicate, path: Path): Predicate {
  if (path.length === 0) return pred; // never remove the root
  const idx = path[path.length - 1];
  return mapAt(pred, path.slice(0, -1), (p) =>
    isGroup(p) ? makeGroup(groupMode(p)!, groupChildren(p).filter((_, i) => i !== idx)) : p,
  );
}

/** Merge `partial` into the comparator at `path` (no-op if it points at a group). */
export function updateComparator(
  pred: Predicate,
  path: Path,
  partial: Partial<Comparator>,
): Predicate {
  return mapAt(pred, path, (p) => (isGroup(p) ? p : { ...p, ...partial }));
}
