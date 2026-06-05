import { describe, expect, test } from "vitest";
import { makeStubDispatch } from "./stub-dispatch";

describe("makeStubDispatch", () => {
  test("trả output đặt trước + ghi call (parse args chuỗi JSON)", async () => {
    const { dispatch, calls } = makeStubDispatch({ laam_find_stuck: { stuck: [] } });
    const r = await dispatch("laam_find_stuck", '{"thresholdMin":15}');
    expect(r).toEqual({ stuck: [] });
    expect(calls).toEqual([{ name: "laam_find_stuck", args: { thresholdMin: 15 } }]);
  });

  test("tool không có stub → trả {} nhưng VẪN ghi call (đo selection)", async () => {
    const { dispatch, calls } = makeStubDispatch({});
    expect(await dispatch("geo_directions", { from: "A" })).toEqual({});
    expect(calls[0]).toEqual({ name: "geo_directions", args: { from: "A" } });
  });
});
