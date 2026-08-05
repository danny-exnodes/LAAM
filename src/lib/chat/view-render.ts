// ChartBlock có chữ ký ({ raw }: { raw: string }) và tự looseJsonParse — nên descriptor
// phải được serialize NGƯỢC về JSON kiểu Chart.js. Đổi ChartBlock để nhận object sẽ
// kéo theo recharts + useChartTheme + test của nó; serialize ở đây rẻ hơn nhiều.
import type { ViewDescriptor } from "@/lib/agent/view";

export function descriptorToChartRaw(d: ViewDescriptor): string | null {
  if (d.kind === "chart") {
    const raw = d.rows?.[0]?.raw;
    return typeof raw === "string" ? raw : null;
  }
  if (!d.chart || !d.rows?.length) return null;
  const { type, labelKey, valueKey } = d.chart;
  return JSON.stringify({
    type,
    title: d.title,
    data: {
      labels: d.rows.map((r) => String(r[labelKey] ?? "")),
      datasets: [{ label: valueKey, data: d.rows.map((r) => Number(r[valueKey] ?? 0)) }],
    },
  });
}
