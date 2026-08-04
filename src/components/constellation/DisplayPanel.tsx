"use client";

// Panel kính nổi giữa màn hình Larvis: bảng/biểu đồ tách khỏi lời nói.
// KHÔNG modal — user phải vừa nhìn vừa nói tiếp, nên không focus-trap, không backdrop
// chặn click, và role là "region" chứ không phải "dialog".
import { useEffect } from "react";
import { X, Rows3 } from "lucide-react";
import { ChartBlock } from "@/components/render/ChartBlock";
import { descriptorToChartRaw } from "@/lib/chat/view-render";
import { useT } from "@/i18n/provider";
import { constellation } from "@/i18n/dictionaries/constellation";
import type { ViewDescriptor } from "@/lib/agent/view";

export type Density = "focus" | "detail";

const FOCUS_ROWS = 3; // liếc mắt đọc được; detail hiện hết những gì descriptor giữ

export function DisplayPanel({
  views,
  density,
  onClose,
  onToggleDensity,
  agentLabel,
}: {
  // Một lượt có thể vừa có bảng vừa có chart — /chat hiện cả hai, panel cũng phải vậy.
  // Trước đây prop là MỘT descriptor nên model trả 2 khối thì user chỉ thấy 1.
  views: ViewDescriptor[];
  density: Density;
  onClose: () => void;
  onToggleDensity: () => void;
  agentLabel: string;
}) {
  const t = useT(constellation);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const head = views[0];

  // Ranh giới tin cậy: số từ tool là số code lấy được; số từ model là model kể lại.
  // Hai thứ đó không được trông giống nhau trên màn hình.
  // Chỉ đếm dòng khi dòng có nghĩa. Descriptor kind="chart" (nguồn B) có đúng 1 "dòng"
  // là chuỗi JSON — in "· 1 ·" ra badge là con số vô nghĩa, tệ hơn không in.
  // Đếm cộng dồn qua các descriptor đếm được (bảng + chart trong cùng lượt).
  const countableRows = views
    .filter((v) => v.kind === "table" || v.kind === "record")
    .reduce((n, v) => n + (v.rows?.length ?? 0), 0);
  const badge =
    head.source.type === "tool"
      ? [
          agentLabel,
          countableRows > 0 ? String(countableRows) : null,
          new Date(head.source.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        ].filter(Boolean).join(" · ")
      : t("constellation.viewSourceAi");

  return (
    <section
      role="region"
      aria-label={head.title}
      className="pointer-events-auto absolute left-[11%] right-[11%] top-[13%] z-30 max-h-[74vh] overflow-y-auto rounded-2xl border border-[#5bd6ff]/30 bg-[#08182a]/[0.92] p-4 text-[#eaf6ff] shadow-[0_0_0_1.5px_rgba(255,196,80,0.45),0_0_30px_rgba(255,196,80,0.30),0_18px_44px_rgba(0,0,0,0.45)] backdrop-blur-xl"
    >
      <div className="mb-2 flex items-start gap-2">
        <span className="rounded-full border border-emerald-400/40 bg-emerald-400/15 px-2 py-0.5 text-[10px] text-emerald-300">
          {badge}
        </span>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{head.title}</h2>
        <button
          type="button"
          onClick={onToggleDensity}
          aria-label={t("constellation.viewDensity")}
          className="rounded-full border border-[#5bd6ff]/30 p-1 text-[#a9e9ff] hover:bg-white/5"
        >
          <Rows3 size={14} />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("constellation.viewClose")}
          className="rounded-full border border-[#5bd6ff]/30 p-1 text-[#a9e9ff] hover:bg-white/5"
        >
          <X size={14} />
        </button>
      </div>

      {views.map((v, i) => (
        <ViewBlock key={i} view={v} density={density} t={t} />
      ))}
    </section>
  );
}

// Thân của MỘT descriptor. Tách ra để panel map qua nhiều descriptor mà không nhân bản
// markup — một lượt có thể vừa có bảng vừa có chart.
function ViewBlock({
  view,
  density,
  t,
}: {
  view: ViewDescriptor;
  density: Density;
  t: (key: string, vars?: Record<string, string>) => string;
}) {
  const rows = view.rows ?? [];
  const shown = density === "focus" ? rows.slice(0, FOCUS_ROWS) : rows;
  const columns = view.columns ?? [];
  const chartRaw = descriptorToChartRaw(view);

  return (
    <>
      {columns.length > 0 && (
        <div className="max-h-[38vh] overflow-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={`border-b border-white/10 pb-1 font-medium text-[#a9e9ff] ${c.align === "right" ? "text-right" : "text-left"}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`border-b border-dashed border-white/10 py-1 ${c.align === "right" ? "text-right tabular-nums" : "text-left"}`}
                    >
                      {String(r[c.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view.truncated && (
        <p className="mt-1 text-[11px] text-[#a9e9ff]/70">
          {t("constellation.viewTruncated", {
            shown: String(view.truncated.shown),
            total: String(view.truncated.total),
          })}
        </p>
      )}

      {/* Ở mật độ focus thường giấu chart cho gọn — TRỪ khi descriptor chỉ có chart
          (nguồn B, block ```chart không kèm bảng): giấu nốt thì panel rỗng trơn. */}
      {chartRaw && (density === "detail" || columns.length === 0) && (
        // KHÔNG ép chiều cao: ChartBlock tự dựng khung 300px bên trong (ChartBlock.tsx),
        // nhồi nó vào h-40 thì 140px dưới — gồm các cột còn lại và nhãn trục X — bị cắt
        // mất. /chat render <ChartBlock> trần đúng như vậy; panel có max-h + scroll rồi
        // nên chart cao không làm tràn màn hình.
        <div className="mt-2">
          <ChartBlock raw={chartRaw} />
        </div>
      )}
    </>
  );
}
