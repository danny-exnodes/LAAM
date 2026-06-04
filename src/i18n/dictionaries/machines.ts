import type { Dict } from "../types";

// Machines page — Hardware Analytics strings (machines.hw.* namespace).
export const machinesDict: Dict = {
  "machines.hw.title": { vi: "Phân tích phần cứng máy chủ", en: "Server hardware analytics", zh: "服务器硬件分析" },
  "machines.hw.cpu": { vi: "CPU", en: "CPU", zh: "处理器" },
  "machines.hw.gpu": { vi: "GPU", en: "GPU", zh: "显卡" },
  "machines.hw.vram": { vi: "VRAM", en: "VRAM", zh: "显存" },
  "machines.hw.ram": { vi: "RAM", en: "RAM", zh: "内存" },
  "machines.hw.cores": { vi: "{n} nhân", en: "{n} cores", zh: "{n} 核" },
  "machines.hw.utilization": { vi: "Mức sử dụng theo thời gian", en: "Utilization over time", zh: "使用率随时间变化" },
  "machines.hw.memory": { vi: "Bộ nhớ theo thời gian", en: "Memory over time", zh: "内存随时间变化" },
  "machines.hw.unavailable": { vi: "Không lấy được số liệu phần cứng (sampler chưa chạy).", en: "Hardware metrics unavailable (sampler not running).", zh: "无法获取硬件指标（采样器未运行）。" },
  "machines.hw.noGpu": { vi: "Không phát hiện GPU", en: "No GPU detected", zh: "未检测到 GPU" },
  "machines.hw.loading": { vi: "Đang lấy số liệu…", en: "Loading metrics…", zh: "正在加载指标…" },
};
