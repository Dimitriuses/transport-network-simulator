// Progress reporting for the instruments that take minutes.
//
// `npm run probe` calibrates several hundred worlds and `npm run gates` runs
// twenty-odd simulations. Both used to print nothing at all until they
// finished, which is indistinguishable from being hung — and the honest
// response to a tool that looks hung is to kill it, which is how a
// forty-minute measurement gets thrown away at minute thirty-nine.
//
// **Progress goes to stderr, never stdout.** Every one of these scripts has its
// output redirected to a file sooner or later, and a progress bar interleaved
// with the report would corrupt it. On stderr the report stays clean and the
// bar still reaches the terminal:
//
//   npm run probe > probe.txt        # bar on screen, report in the file
//
// **And it works without a terminal.** When stderr is not a TTY — piped, in CI,
// or a background job whose output is being collected — a carriage-return bar
// would emit one enormous line of overwrites. So that case prints a plain line
// every so often instead, which is what makes a background run legible.

/** How often a non-terminal run prints a line. */
const LINE_INTERVAL_MS = 15_000;

/** Below this many steps, the work is short enough that a bar is noise. */
const MIN_STEPS_TO_REPORT = 4;

export interface Progress {
  /** One unit of work finished. `label` names what is being worked on now. */
  step(label?: string): void;
  /** Clear the bar. Safe to call twice, and safe never to call. */
  done(): void;
}

function human(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "--:--";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * A progress reporter for `total` units of work.
 *
 * Silent when `TNS_PROGRESS=off`, when the work is trivially short, or when
 * `total` is not known — in which case saying nothing is better than inventing
 * an estimate.
 */
export function progress(total: number, title: string): Progress {
  const enabled =
    process.env["TNS_PROGRESS"] !== "off" &&
    Number.isFinite(total) &&
    total >= MIN_STEPS_TO_REPORT;

  if (!enabled) return { step: () => {}, done: () => {} };

  const isTty = process.stderr.isTTY === true;
  const startedMs = Date.now();
  let doneCount = 0;
  let lastLineMs = 0;
  let dirty = false;

  const render = (label: string): void => {
    const elapsed = Date.now() - startedMs;
    // Extrapolate from what has actually been measured. Before the first step
    // finishes there is nothing to extrapolate from, and a guess would be worse
    // than an honest "--:--".
    const remaining = doneCount === 0 ? Number.NaN : (elapsed / doneCount) * (total - doneCount);
    const pct = Math.floor((doneCount / total) * 100);
    const width = 24;
    const filled = Math.round((doneCount / total) * width);
    const bar = "#".repeat(filled) + "-".repeat(width - filled);
    const head = `  ${title} [${bar}] ${doneCount}/${total} ${String(pct).padStart(3)}%`;
    const tail = ` elapsed ${human(elapsed)} · left ~${human(remaining)}`;

    if (isTty) {
      const line = `${head}${tail}${label ? ` · ${label}` : ""}`;
      // Pad to overwrite whatever the last, possibly longer, line left behind.
      process.stderr.write(`\r${line.padEnd(110).slice(0, 110)}`);
      dirty = true;
      return;
    }

    // No terminal: one line every LINE_INTERVAL_MS, plus the last one. A
    // carriage return here would produce a single unreadable mega-line in a
    // log file.
    const now = Date.now();
    if (now - lastLineMs < LINE_INTERVAL_MS && doneCount < total) return;
    lastLineMs = now;
    process.stderr.write(`${head}${tail}\n`);
  };

  return {
    step(label?: string) {
      doneCount++;
      render(label ?? "");
    },
    done() {
      if (isTty && dirty) {
        process.stderr.write(`\r${" ".repeat(110)}\r`);
        dirty = false;
      } else if (!isTty && doneCount > 0) {
        process.stderr.write(
          `  ${title} finished ${doneCount}/${total} in ${human(Date.now() - startedMs)}\n`,
        );
      }
    },
  };
}
