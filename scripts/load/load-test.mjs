#!/usr/bin/env node
// Zero-dependency HTTP load baseline. Usage:
//   node scripts/load/load-test.mjs http://127.0.0.1:PORT [out.json]
// Concurrency ladder 1/10/50 x { /, /up }, 5s each. See PERFORMANCE.md.
const base = (process.argv[2] || "http://127.0.0.1:3000").replace(/\/$/, "");
const outFile = process.argv[3] || "";
const PATHS = ["/", "/up"];
const CONCURRENCIES = [1, 10, 50];
const DURATION_MS = 5000;
const TIMEOUT_MS = 5000;

async function bench(url, concurrency) {
  const latencies = [];
  let errors = 0;
  let requests = 0;
  const end = Date.now() + DURATION_MS;

  async function worker() {
    while (Date.now() < end) {
      const t0 = performance.now();
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        await r.arrayBuffer();
        if (!r.ok) errors++;
      } catch {
        errors++;
      }
      latencies.push(performance.now() - t0);
      requests++;
    }
  }

  const t0 = Date.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const elapsed = (Date.now() - t0) / 1000;
  latencies.sort((a, b) => a - b);
  const pct = (p) => latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))] ?? 0;
  return {
    url,
    concurrency,
    requests,
    errors,
    seconds: +elapsed.toFixed(2),
    rps: +(requests / elapsed).toFixed(1),
    p50_ms: +pct(0.5).toFixed(1),
    p95_ms: +pct(0.95).toFixed(1),
    p99_ms: +pct(0.99).toFixed(1),
  };
}

const results = [];
for (const path of PATHS) {
  for (const conc of CONCURRENCIES) {
    const row = await bench(base + path, conc);
    results.push(row);
    console.log(
      `${path.padEnd(5)} conc=${String(conc).padStart(2)} ` +
        `rps=${String(row.rps).padStart(7)} p50=${String(row.p50_ms).padStart(6)}ms ` +
        `p95=${String(row.p95_ms).padStart(6)}ms p99=${String(row.p99_ms).padStart(6)}ms ` +
        `err=${row.errors}`
    );
  }
}

const report = {
  generated_at: new Date().toISOString(),
  base,
  duration_ms: DURATION_MS,
  results,
};
if (outFile) {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`written: ${outFile}`);
}
const errs = results.reduce((n, r) => n + r.errors, 0);
process.exit(errs > 0 ? 1 : 0);
