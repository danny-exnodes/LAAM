// WCAG contrast guards for the Matte Dark token layer + chart palettes.
// Guards QA findings A1/W5 (backlog/matte-dark-qa-ui-bugs.md): the bright
// cyan #36a6d6 only gives 2.77:1 against white — both as a white-text button
// fill (dark mode) and as a chart series on the white light-mode card. The
// ratios are COMPUTED here (WCAG 2.x relative luminance), not asserted as
// hardcoded hex strings, so retuning a token only fails if it drops below
// the floor it must hold.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { DARK, LIGHT } from "@/hooks/useChartTheme";

// ── WCAG 2.x contrast math ────────────────────────────────────────────────
function channel(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  return (
    0.2126 * channel(parseInt(h.slice(0, 2), 16)) +
    0.7152 * channel(parseInt(h.slice(2, 4), 16)) +
    0.0722 * channel(parseInt(h.slice(4, 6), 16))
  );
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ── token extraction from globals.css ─────────────────────────────────────
// vitest runs with cwd = project root (jsdom rewrites import.meta.url, so a
// file-URL relative read is not available here).
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function block(selector: string): string {
  const m = css.match(new RegExp(`(?:^|\\n)${selector.replace(".", "\\.")} \\{([\\s\\S]*?)\\n\\}`));
  if (!m) throw new Error(`block not found in globals.css: ${selector}`);
  return m[1];
}
function token(blockCss: string, name: string): string {
  const m = blockCss.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`token not found: ${name}`);
  return m[1].trim();
}

const root = block(":root");
const dark = block(".dark");
const theme = block("@theme");

describe("--accent-fill (white-text CTA fill) — QA W5 residual ③", () => {
  test("light fill holds white text at AA (≥4.5:1)", () => {
    expect(contrast("#ffffff", token(root, "--accent-fill"))).toBeGreaterThanOrEqual(4.5);
  });

  test("dark fill holds white text at AA (≥4.5:1) — the bright dark accent must NOT be reused", () => {
    // .dark may rely on the :root value; resolve like the cascade does.
    let fill: string;
    try {
      fill = token(dark, "--accent-fill");
    } catch {
      fill = token(root, "--accent-fill");
    }
    expect(contrast("#ffffff", fill)).toBeGreaterThanOrEqual(4.5);
    // Documents WHY the fill is its own token: the dark accent fails for white text.
    expect(contrast("#ffffff", token(dark, "--accent"))).toBeLessThan(4.5);
  });
});

describe("decorative accent tints — QA W5 residual ①", () => {
  test(":root --accent-muted/--accent-glow are tints of the LIGHT accent, not the old bright cyan", () => {
    const accent = token(root, "--accent"); // #rrggbb
    const rgb = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16)).join(", ");
    expect(token(root, "--accent-muted")).toBe(`rgba(${rgb}, 0.14)`);
    expect(token(root, "--accent-glow")).toBe(`rgba(${rgb}, 0.3)`);
  });
});

describe("chart series palette — QA W5 residual ② (WCAG 1.4.11 non-text ≥3:1)", () => {
  // Light chart cards are white (.chart-card background: #fff).
  test("light series colors hold ≥3:1 on the white card", () => {
    expect(contrast(LIGHT.series.accent, "#ffffff")).toBeGreaterThanOrEqual(3);
    expect(contrast(LIGHT.series.sky, "#ffffff")).toBeGreaterThanOrEqual(3);
  });

  // Dark chart cards use --color-neutral-900 (read from the @theme block so
  // this guard follows the token, not a copy of it).
  test("dark series colors hold ≥3:1 on the dark card", () => {
    const cardBg = token(theme, "--color-neutral-900").split(";")[0].split("/*")[0].trim();
    expect(contrast(DARK.series.accent, cardBg)).toBeGreaterThanOrEqual(3);
    expect(contrast(DARK.series.sky, cardBg)).toBeGreaterThanOrEqual(3);
  });

  test("documents the bug: the bright cyans fail 3:1 on white — light MUST darken them", () => {
    expect(contrast("#36a6d6", "#ffffff")).toBeLessThan(3);
    expect(contrast("#0ea5e9", "#ffffff")).toBeLessThan(3);
  });
});
