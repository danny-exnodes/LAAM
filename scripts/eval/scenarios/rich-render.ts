import type { Scenario } from "../types";

// extraToolSchema geo: model PHẢI thấy tool mới có cơ hội gọi (prod chưa đăng ký → baseline ~fail).
export const geoDirections: Scenario = {
  id: "geo-directions", capability: "tool-selection",
  input: "Chỉ đường từ Hồ Gươm tới Văn Miếu.",
  extraToolSchemas: [{ type: "function", function: {
    name: "geo_directions",
    description: "Tìm đường đi giữa hai địa điểm (trả khoảng cách + các bước).",
    parameters: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] },
  } }],
  toolStubs: { geo_directions: { distanceKm: 2.1, steps: ["đi theo Lê Thái Tổ", "rẽ Nguyễn Thái Học"] } },
  expect: { callsTool: "geo_directions", maxRounds: 2 },
};

export const chartRender: Scenario = {
  id: "chart-render", capability: "rich-block",
  input: "Vẽ biểu đồ cột doanh thu 4 quý: 12, 19, 9, 15.",
  expect: { emitsBlock: "chart" },
};
