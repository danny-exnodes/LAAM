// LAAM collector — pure retry/backoff helpers (no shebang, no side effects), so the
// CLI (laam-collector.mjs, which carries a #! shebang the test bundler can't parse)
// and the Vitest suite can both import them. The CLI re-exports these.

/** Backoff trước lần retry duy nhất sau khi push fail. */
export const RETRY_BACKOFF_MS = 2000;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Backoff có jitter: base + tới +100% ngẫu nhiên. Tối thiểu vẫn = base (không bao giờ retry
 * nhanh hơn), nhưng nhiều collector cùng fail một lúc sẽ KHÔNG retry đồng loạt (chống
 * thundering-herd / tự tái tạo spike). `random` inject được cho test.
 */
export function jitteredBackoff(baseMs, random = Math.random) {
  return baseMs + Math.floor(random() * baseMs);
}

/**
 * Chạy `push` với tối đa 1 retry sau backoff. KHÔNG bao giờ throw — trả về
 * true (thành công) / false (cả hai lần đều fail) để vòng setInterval không
 * chết vì một lần mạng/server lỗi. `sleep`/`log` inject được cho test.
 */
export async function pushWithRetry(push, { backoffMs = RETRY_BACKOFF_MS, sleep: wait = sleep, log = console.error, random = Math.random } = {}) {
  try {
    await push();
    return true;
  } catch (err) {
    const delay = jitteredBackoff(backoffMs, random);
    log(`[${new Date().toISOString()}] ✗ Push lỗi (${err?.message ?? err}) — retry sau ${Math.round(delay / 100) / 10}s…`);
    await wait(delay);
  }
  try {
    await push();
    return true;
  } catch (err) {
    log(`[${new Date().toISOString()}] ✗ Retry vẫn lỗi: ${err?.message ?? err}`);
    return false;
  }
}

/**
 * Tạo 1 chu kỳ push có đếm thất bại liên tiếp: fail (cả retry) → tăng
 * consecutiveFailures + log; thành công → reset về 0. Trả về số đếm hiện tại
 * (0 = chu kỳ này thành công). Không throw.
 */
export function makeCycle(push, { log = console.error, ...retryOpts } = {}) {
  let consecutiveFailures = 0;
  return async function cycle() {
    const ok = await pushWithRetry(push, { log, ...retryOpts });
    if (ok) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures += 1;
      log(
        `[${new Date().toISOString()}] ✗ Push thất bại (consecutiveFailures=${consecutiveFailures}) — chờ chu kỳ sau.`,
      );
    }
    return consecutiveFailures;
  };
}
