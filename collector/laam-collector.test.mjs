// Retry hardening (W2/M9): một lần fail mạng/server KHÔNG được làm mất chu kỳ
// đẩy dữ liệu (giám sát multi-machine phải tự hồi phục), và fail kép không được
// crash vòng setInterval — pushWithRetry/makeCycle phải nuốt lỗi, log có
// timestamp và đếm consecutiveFailures để vận hành thấy được mức độ sự cố.
import { describe, expect, test, vi } from "vitest";
import { pushWithRetry, makeCycle, RETRY_BACKOFF_MS } from "./laam-collector.mjs";

const noSleep = vi.fn(async () => {});

describe("collector pushWithRetry", () => {
  test("backoff mặc định đúng spec 2s", () => {
    expect(RETRY_BACKOFF_MS).toBe(2000);
  });

  test("thành công ngay lần đầu → true, không retry/backoff/log", async () => {
    const push = vi.fn(async () => {});
    const sleep = vi.fn(async () => {});
    const log = vi.fn();
    await expect(pushWithRetry(push, { sleep, log })).resolves.toBe(true);
    expect(push).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  test("fail lần 1 → backoff đúng RETRY_BACKOFF_MS rồi retry; retry OK → true", async () => {
    const push = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce(undefined);
    const sleep = vi.fn(async () => {});
    const log = vi.fn();
    await expect(pushWithRetry(push, { sleep, log })).resolves.toBe(true);
    expect(push).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(RETRY_BACKOFF_MS);
    expect(log).toHaveBeenCalledTimes(1); // chỉ log lần fail đầu
  });

  test("fail cả 2 lần → resolve false, KHÔNG throw (vòng setInterval sống sót)", async () => {
    const push = vi.fn().mockRejectedValue(new Error("Ingest lỗi 500"));
    const log = vi.fn();
    // .resolves (chứ không phải .rejects) chính là yêu cầu không-crash.
    await expect(pushWithRetry(push, { sleep: noSleep, log })).resolves.toBe(false);
    expect(push).toHaveBeenCalledTimes(2); // đúng 1 retry, không retry vô hạn
  });

  test("log lỗi phải mở đầu bằng ISO timestamp để vận hành biết fail lúc nào", async () => {
    const push = vi.fn().mockRejectedValue(new Error("down"));
    const log = vi.fn();
    await pushWithRetry(push, { sleep: noSleep, log });
    expect(log.mock.calls.length).toBeGreaterThan(0);
    for (const [msg] of log.mock.calls) {
      expect(msg).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }
  });
});

describe("collector makeCycle — consecutiveFailures", () => {
  test("đếm tăng qua các chu kỳ fail, reset về 0 khi thành công, đếm lại từ 1", async () => {
    let down = true;
    const push = vi.fn(async () => {
      if (down) throw new Error("server down");
    });
    const log = vi.fn();
    const cycle = makeCycle(push, { sleep: noSleep, log });

    expect(await cycle()).toBe(1); // fail (kể cả retry) → 1
    expect(await cycle()).toBe(2); // vẫn fail → 2
    down = false;
    expect(await cycle()).toBe(0); // server hồi phục → reset
    down = true;
    expect(await cycle()).toBe(1); // fail mới đếm lại từ 1, không cộng dồn cũ

    // Log đếm phải nêu rõ con số để đọc được mức độ sự cố từ log.
    const counted = log.mock.calls.filter(([m]) => /consecutiveFailures=\d+/.test(m));
    expect(counted.some(([m]) => m.includes("consecutiveFailures=2"))).toBe(true);
  });

  test("cycle không bao giờ reject dù push luôn throw", async () => {
    const cycle = makeCycle(
      vi.fn().mockRejectedValue(new Error("boom")),
      { sleep: noSleep, log: vi.fn() },
    );
    await expect(cycle()).resolves.toBeTypeOf("number");
  });
});
