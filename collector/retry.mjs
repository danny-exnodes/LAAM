// LAAM collector — pure retry/backoff helpers (no shebang, no side effects), so the
// CLI (laam-collector.mjs, which carries a #! shebang the test bundler can't parse)
// and the Vitest suite can both import them. The CLI re-exports these.

/** Backoff trước lần retry duy nhất sau khi push fail. */
export const RETRY_BACKOFF_MS = 2000;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Chạy `push` với tối đa 1 retry sau backoff. KHÔNG bao giờ throw — trả về
 * true (thành công) / false (cả hai lần đều fail) để vòng setInterval không
 * chết vì một lần mạng/server lỗi. `sleep`/`log` inject được cho test.
 */
export async function pushWithRetry(push, { backoffMs = RETRY_BACKOFF_MS, sleep: wait = sleep, log = console.error } = {}) {
  try {
    await push();
    return true;
  } catch (err) {
    log(`[${new Date().toISOString()}] ✗ Push lỗi (${err?.message ?? err}) — retry sau ${backoffMs / 1000}s…`);
    await wait(backoffMs);
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
