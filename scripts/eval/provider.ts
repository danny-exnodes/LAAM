// Chọn provider cho eval. WHY: `makeRealOllama` chỉ đo được model local, nhưng model đang
// dùng thật trên /chat và /constellation (`gpt-oss-120b`) chạy qua BytePlus — đo sai provider
// là đo sai model. Mặc định giữ nguyên Ollama để các eval cũ không đổi hành vi.
import { byteplusChat } from "@/lib/llm/byteplus";
import type { ChatMessage, OllamaChatResponse, ToolRoundsDeps } from "@/lib/agent/orchestrator";
import type { ConnectorTool } from "@/lib/connectors/types";
import { makeRealOllama, ollamaCfgFromEnv } from "./ollama";

export type EvalProvider = {
  provider: "ollama" | "byteplus";
  model: string;
  caller: ToolRoundsDeps["callOllama"];
  label: string; // in vào báo cáo — đọc số mà không biết đo trên model nào thì vô nghĩa
};

function makeByteplus(model: string, temperature: number): ToolRoundsDeps["callOllama"] {
  return (messages: ChatMessage[], tools: ConnectorTool[]): Promise<OllamaChatResponse> =>
    byteplusChat({ model, messages, tools: tools.length ? tools : undefined, options: { temperature } });
}

export function pickEvalProvider(): EvalProvider {
  const temperature = Number.isFinite(Number(process.env.EVAL_TEMPERATURE)) ? Number(process.env.EVAL_TEMPERATURE) : 0.6;
  if ((process.env.EVAL_PROVIDER ?? "").toLowerCase() === "byteplus") {
    // Fail loud (Rule 12): thiếu key mà lặng lẽ tụt về Ollama thì báo cáo ghi một model,
    // số đo lại của model khác.
    if (!process.env.BYTEPLUS_API_KEY) throw new Error("EVAL_PROVIDER=byteplus nhưng thiếu BYTEPLUS_API_KEY");
    const model = process.env.EVAL_MODEL ?? "gpt-oss-120b";
    return { provider: "byteplus", model, caller: makeByteplus(model, temperature), label: `byteplus/${model} T=${temperature}` };
  }
  const cfg = ollamaCfgFromEnv();
  return { provider: "ollama", model: cfg.model, caller: makeRealOllama(cfg), label: `ollama/${cfg.model} T=${cfg.options.temperature}` };
}
