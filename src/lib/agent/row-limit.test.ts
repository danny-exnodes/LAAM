import { describe, it, expect, afterEach } from "vitest";
import { raiseRowLimit, rowLimitEnabled } from "./row-limit";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

function configure(args = "max_rows,limit", ceiling = "1000") {
  process.env.TOOL_ROW_LIMIT_ARGS = args;
  process.env.TOOL_ROW_LIMIT = ceiling;
}

describe("raiseRowLimit", () => {
  // WHY (Rule 9): the connector's own tool description tells the model to cap at 50 to protect
  // its context. The model no longer receives the rows, so that cap now only costs the USER
  // rows — measured: asked for "every refund", got 50 of 62, and 12 were unreachable anywhere.
  it("raises a cap the model set below the ceiling", () => {
    configure();
    expect(raiseRowLimit({ id: "q1", max_rows: 50 })).toEqual({ id: "q1", max_rows: 1000 });
  });

  // A deliberate larger request must never be quietly reduced — the ceiling is a floor-raiser,
  // not a limiter.
  it("leaves a larger request alone", () => {
    configure();
    const args = { id: "q1", max_rows: 5000 };
    expect(raiseRowLimit(args)).toBe(args);
  });

  // Injecting the argument would turn a tool whose default is "everything" into a capped one.
  it("does not add the argument when the caller omitted it", () => {
    configure();
    const args = { id: "q1" };
    expect(raiseRowLimit(args)).toBe(args);
  });

  it("touches only the configured argument names", () => {
    configure("max_rows");
    expect(raiseRowLimit({ max_rows: 50, limit: 10 })).toEqual({ max_rows: 1000, limit: 10 });
  });

  // Unset env ⇒ behaviour identical to before this existed. LAAM must not carry any connector's
  // argument names in code (same rule as TOOL_DATA_FETCH / TOOL_DRILLDOWN_PAIRS).
  it("is a no-op when unconfigured", () => {
    delete process.env.TOOL_ROW_LIMIT_ARGS;
    delete process.env.TOOL_ROW_LIMIT;
    const args = { max_rows: 50 };
    expect(rowLimitEnabled()).toBe(false);
    expect(raiseRowLimit(args)).toBe(args);
  });

  it("ignores a non-numeric value rather than coercing it", () => {
    configure();
    const args = { max_rows: "50" };
    expect(raiseRowLimit(args)).toBe(args);
  });

  it("survives args that are not an object", () => {
    configure();
    expect(raiseRowLimit(null)).toBe(null);
    expect(raiseRowLimit("x")).toBe("x");
  });
});
