export type CurvePoint = { probe: string; n: number; passed: number; total: number; noCall?: number };

// Wilson score interval 95% (z=1.96) — CI cho pass-rate k-run, không cần dep.
export function wilson(passed: number, total: number): [number, number] {
  if (total === 0) return [0, 0];
  const z = 1.96, p = passed / total, z2 = z * z;
  const denom = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return [Math.max(0, (centre - margin) / denom), Math.min(1, (centre + margin) / denom)];
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + "%" : "—");

// Bảng markdown probe × N (ô = pass-rate; hàng cuối = trung bình theo N) + dòng no-call riêng
// cho probe có noCall>0 (Nit 1: tách "không gọi" khỏi "gọi sai").
export function curveTable(points: CurvePoint[], sizes: number[]): string {
  const probes = [...new Set(points.map((p) => p.probe))];
  const at = (probe: string, n: number) => points.find((p) => p.probe === probe && p.n === n);
  const head = `| probe \\\\ #tools | ${sizes.join(" | ")} |`;
  const sep = `|${" --- |".repeat(sizes.length + 1)}`;
  const rows = probes.map((pr) => `| ${pr} | ${sizes.map((n) => { const c = at(pr, n); return c ? pct(c.passed, c.total) : "—"; }).join(" | ")} |`);
  const avg = `| **avg** | ${sizes.map((n) => {
    const cs = points.filter((p) => p.n === n);
    const pa = cs.reduce((s, c) => s + c.passed, 0);
    const to = cs.reduce((s, c) => s + c.total, 0);
    return pct(pa, to);
  }).join(" | ")} |`;
  let out = [head, sep, ...rows, avg].join("\n");

  const ncProbes = probes.filter((pr) => points.some((p) => p.probe === pr && (p.noCall ?? 0) > 0));
  if (ncProbes.length) {
    out += "\n\n**no-call** (số run model KHÔNG gọi tool nào — failure mode E0 chỉ ra):\n";
    out += ncProbes
      .map((pr) => `- ${pr}: ` + sizes.map((n) => { const c = at(pr, n); return c && c.noCall !== undefined ? `${n}→${c.noCall}/${c.total}` : ""; }).filter(Boolean).join(", "))
      .join("\n");
  }
  return out;
}
