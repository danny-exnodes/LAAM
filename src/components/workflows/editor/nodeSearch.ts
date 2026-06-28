/**
 * nodeSearch.ts — PURE (no side effects, no I/O, no React).
 *
 * Filtering logic for the Cmd/Ctrl+K node palette. The matcher is i18n-agnostic:
 * the caller injects `labelOf(kind)` returning the LOCALIZED text to search
 * (name + description), so matching respects the active language (vi/en/zh) and
 * never trusts a model — it matches real, code-resolved UI strings (Rule 13).
 *
 * Matching is case- AND diacritic-insensitive so a Vietnamese operator can type
 * "dieu kien" and find "Điều kiện" without the accents.
 */
import type { WfNodeKind } from "@/lib/workflow/types";

/** Fold case + Vietnamese diacritics (and đ→d) for accent-insensitive matching. */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritical marks
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

/**
 * filterKinds — keep the kinds whose localized label contains every
 * whitespace-separated term of `query` (folded). An empty query returns all
 * kinds in their original order (the palette's default view).
 */
export function filterKinds(
  query: string,
  kinds: readonly WfNodeKind[],
  labelOf: (kind: WfNodeKind) => string,
): WfNodeKind[] {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...kinds];
  return kinds.filter((kind) => {
    const hay = fold(labelOf(kind));
    return terms.every((term) => hay.includes(term));
  });
}
