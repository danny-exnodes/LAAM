import type { Scenario } from "../types";

// geo trong LAAM = khối map fenced client-resolve (geo-resolve.ts), KHÔNG phải tool-call.
// Đo ĐÚNG cơ chế (song song chart-render): model có emit khối ```map {"directions":{from,to}} không?
export const geoDirections: Scenario = {
  id: "geo-directions", capability: "rich-block",
  input: "Chỉ đường từ Hồ Gươm tới Văn Miếu.",
  expect: { emitsBlock: "map" },
};

export const chartRender: Scenario = {
  id: "chart-render", capability: "rich-block",
  input: "Vẽ biểu đồ cột doanh thu 4 quý: 12, 19, 9, 15.",
  expect: { emitsBlock: "chart" },
};
