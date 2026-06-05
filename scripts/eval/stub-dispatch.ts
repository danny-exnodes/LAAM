import type { DispatchCall, ToolStubs } from "./types";
import { parseArgs } from "./util";

// dispatch khớp ToolRoundsDeps["dispatch"]: (name, args) => Promise<unknown>.
// Ghi mọi lời gọi (args đã parse) + trả output đặt trước (hoặc {} → vẫn đo được selection).
export function makeStubDispatch(stubs: ToolStubs = {}): {
  dispatch: (name: string, args: unknown) => Promise<unknown>;
  calls: DispatchCall[];
} {
  const calls: DispatchCall[] = [];
  const dispatch = async (name: string, args: unknown) => {
    calls.push({ name, args: parseArgs(args) });
    return Object.prototype.hasOwnProperty.call(stubs, name) ? stubs[name] : {};
  };
  return { dispatch, calls };
}
