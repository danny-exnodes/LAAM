#!/usr/bin/env node
// LAAM host metrics sampler (zero-dep). Samples CPU (os.cpus delta), RAM (os.mem),
// and GPUs (nvidia-smi) every ~1s; serves the latest snapshot at GET /metrics.
//
// Run on the HOST (native), NOT in Docker — it needs nvidia-smi + the real host
// CPU/RAM. The app reaches it via host.docker.internal:PORT (prod container) or
// 127.0.0.1:PORT (dev). Binds 0.0.0.0 so the container can reach it.
//
//   node host-agent/laam-host-metrics.mjs
//   HOST_METRICS_PORT=47600 HOST_METRICS_TOKEN=secret node host-agent/laam-host-metrics.mjs
import os from "node:os";
import http from "node:http";
import { execFile } from "node:child_process";

const PORT = Number(process.env.HOST_METRICS_PORT) || 47600;
const TOKEN = process.env.HOST_METRICS_TOKEN || "";
const MIB = 1024 * 1024;

function cpuSnapshot() {
  return os.cpus().map((c) => {
    const t = c.times;
    const total = t.user + t.nice + t.sys + t.idle + t.irq;
    return { idle: t.idle, total };
  });
}
let prev = cpuSnapshot();

function gpus() {
  return new Promise((resolve) => {
    execFile(
      "nvidia-smi",
      [
        "--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw",
        "--format=csv,noheader,nounits",
      ],
      { timeout: 4000 },
      (err, stdout) => {
        if (err) return resolve([]);
        const out = [];
        for (const line of stdout.trim().split(/\r?\n/)) {
          const p = line.split(",").map((s) => s.trim());
          if (p.length < 7) continue;
          const power = parseFloat(p[6]);
          out.push({
            index: Number(p[0]),
            name: p[1],
            utilPct: Number(p[2]),
            memUsedBytes: Number(p[3]) * MIB,
            memTotalBytes: Number(p[4]) * MIB,
            tempC: Number(p[5]),
            powerW: Number.isFinite(power) ? power : null,
          });
        }
        resolve(out);
      },
    );
  });
}

let latest = null;
async function sample() {
  const cur = cpuSnapshot();
  let idleD = 0;
  let totalD = 0;
  for (let i = 0; i < cur.length; i++) {
    idleD += cur[i].idle - prev[i].idle;
    totalD += cur[i].total - prev[i].total;
  }
  prev = cur;
  const usagePct = totalD > 0 ? Math.round((1 - idleD / totalD) * 100) : 0;
  const cpus = os.cpus();
  latest = {
    ts: Date.now(),
    cpu: { usagePct, cores: cpus.length, model: cpus[0]?.model?.trim() || "CPU" },
    ram: { usedBytes: os.totalmem() - os.freemem(), totalBytes: os.totalmem() },
    gpus: await gpus(),
  };
}
await sample();
setInterval(sample, 1000);

http
  .createServer((req, res) => {
    if ((req.url || "").split("?")[0] !== "/metrics") {
      res.writeHead(404).end();
      return;
    }
    if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401).end();
      return;
    }
    res.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    });
    res.end(JSON.stringify(latest));
  })
  .listen(PORT, "0.0.0.0", () => console.log(`[laam-host-metrics] listening on :${PORT}`));
