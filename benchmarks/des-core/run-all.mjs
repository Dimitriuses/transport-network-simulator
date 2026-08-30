/**
 * Runs the full benchmark matrix and prints a Markdown table.
 *
 *   node run-all.mjs                 # default sizes
 *   node run-all.mjs 50000 500000    # custom passenger counts
 *
 * Verifies that every implementation reports the same final-state checksum for
 * a given size. A mismatch means the implementations are no longer doing
 * identical work and the timings are not comparable -- the run fails.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const sizes = process.argv.slice(2).map(Number).filter(Boolean);
const SIZES = sizes.length > 0 ? sizes : [200_000, 1_000_000];

function findPython() {
  for (const cmd of ["python", "python3"]) {
    const probe = spawnSync(cmd, ["--version"], { encoding: "utf8" });
    if (probe.status === 0) return cmd;
  }
  return null;
}

const PYTHON = findPython();
if (!PYTHON) console.error("! python not found on PATH — skipping the Python baseline\n");

function run(cmd, args, label) {
  process.stderr.write(`  running ${label} ...\r`);
  const r = spawnSync(cmd, args, { cwd: here, encoding: "utf8", maxBuffer: 1 << 24 });
  if (r.status !== 0) {
    console.error(`\n! ${label} failed:\n${r.stderr || r.stdout}`);
    return null;
  }
  const line = r.stdout.trim().split("\n").pop();
  try {
    return JSON.parse(line);
  } catch {
    console.error(`\n! ${label} produced unparseable output: ${line}`);
    return null;
  }
}

const results = [];

for (const n of SIZES) {
  console.error(`\n${n.toLocaleString("en-US")} passengers:`);
  const batch = [
    run(process.execPath, ["bench.ts", "typed", String(n)], "node / typed arrays"),
    run(process.execPath, ["bench.ts", "obj", String(n)], "node / objects"),
    PYTHON ? run(PYTHON, ["bench.py", String(n)], "python / heapq") : null,
  ].filter(Boolean);

  const checksums = new Set(batch.map((b) => b.checksum));
  if (checksums.size > 1) {
    console.error(
      `\n! checksum mismatch at ${n} passengers: ${[...checksums].join(", ")}\n` +
        `  The implementations are not doing identical work; timings are not comparable.`,
    );
    process.exit(1);
  }
  process.stderr.write(`  checksum ${batch[0]?.checksum} — all implementations agree\n`);
  results.push({ n, batch });
}

const LABEL = {
  typed: "Node — typed arrays",
  obj: "Node — objects",
  heapq: "Python — heapq",
};

console.log("");
for (const { n, batch } of results) {
  const events = batch[0].events;
  console.log(
    `**${n.toLocaleString("en-US")} passengers — ${events.toLocaleString("en-US")} events**\n`,
  );
  console.log("| Implementation | Events/sec | Wall time | RSS |");
  console.log("|---|---:|---:|---:|");
  for (const b of batch) {
    const rss = b.rss_mb ? `${b.rss_mb} MB` : "—";
    console.log(
      `| ${LABEL[b.mode] ?? b.mode} | ${b.events_per_sec.toLocaleString("en-US")} | ` +
        `${b.seconds.toFixed(2)} s | ${rss} |`,
    );
  }
  console.log("");
}

const env = results[0]?.batch ?? [];
console.log(
  `_Measured on ${process.platform}-${process.arch}, ` +
    `${env.find((b) => b.mode !== "heapq")?.runtime ?? "node"}` +
    `${PYTHON ? `, ${env.find((b) => b.mode === "heapq")?.runtime ?? "python"}` : ""}._`,
);
