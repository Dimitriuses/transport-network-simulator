// Measuring a world's difficulty as a profile over the reference solutions.
//
// Specification: KNOWN-ISSUES.md #24 and #42, ROADMAP.md P1M4.
//
// **Difficulty is a property of the (world, solver) pair, not of the world.**
// `P2rt` loses most of its headroom to the declared conflicts while the naive
// reference player loses to two of them, and the conflict dominating Gate 3
// costs it nothing. A scalar cannot express that: two worlds could match on one
// baseline and differ completely for every other solver, and nothing would
// notice.
//
// This is the library both `npm run profile` and `npm run calibrate:tier` use.
// It lives here rather than in either script because they need exactly the same
// measurement and a second copy of it would drift — which is the failure this
// project has now recorded four times (`KNOWN-ISSUES.md` #19, #35, #40, #44).

import { spawn } from "node:child_process";
import { runOpenLoop } from "@tns/server";
import type { World } from "@tns/schema";
import { scoreRun } from "./scorecard.ts";

/** The anchors, worst to best *by construction* rather than by measurement. */
export const REFERENCE_MODES = ["null", "blind", "naive", "competent"] as const;
export type ReferenceMode = (typeof REFERENCE_MODES)[number];

/**
 * The reference the calibration search screens on.
 *
 * `naive` is the most sensitive of the four to *which* conflicts land and at
 * what strength — it is the reference that separated two same-tier worlds by
 * 5.9 times their own noise while `competent` saw them as identical. Screening
 * on the sensitive one rejects bad draws cheaply.
 *
 * **Screening on it is not calibrating to it.** A search that only ever
 * consulted `naive` would produce worlds tuned for `naive`, which is `#24`'s
 * trap in a new place; survivors are verified against the whole profile.
 */
export const SCREENING_MODE: ReferenceMode = "naive";

/** One reference solution's whole scorecard on one run. */
export interface ReferencePoint {
  readonly headline: number;
  readonly capture: number;
  readonly information: number;
  readonly arrived: number;
}

export interface ProfilePorts {
  readonly operator: number;
  readonly control: number;
  readonly player: number;
}

/** Every reference's points across seeds. */
export type DifficultyProfile = Record<string, ReferencePoint[]>;

export const mean = (xs: readonly number[]): number =>
  xs.reduce((a, b) => a + b, 0) / xs.length;

/** Sample standard deviation; zero for fewer than two points. */
export const sd = (xs: readonly number[]): number => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
};

/**
 * Run one reference solution against one world.
 *
 * Returns `null` when the run produced no headline — nothing comparable — which
 * is a missing measurement rather than a score of zero.
 */
export async function measureReference(
  repoRoot: string,
  world: World,
  mode: string,
  ports: ProfilePorts,
  /** Extra environment for the player — `TNS_TUNING` for the `tuned` mode. */
  extraEnv: Readonly<Record<string, string>> = {},
): Promise<ReferencePoint | null> {
  const player = spawn(
    process.execPath,
    [
      "--disable-warning=ExperimentalWarning",
      `${repoRoot}/src/refplayer/scripts/serve.ts`,
    ],
    {
      cwd: repoRoot,
      stdio: ["ignore", "ignore", "inherit"],
      env: {
        ...process.env,
        TNS_PLAYER_PORT: String(ports.player),
        TNS_CONTROL_URL: `http://127.0.0.1:${ports.control}`,
        TNS_PLAYER_MODE: mode,
        ...extraEnv,
      },
    },
  );
  try {
    const log = await runOpenLoop({
      world,
      operatorPort: ports.operator,
      controlPort: ports.control,
      playerBaseUrl: `http://127.0.0.1:${ports.player}`,
    });
    const card = scoreRun(log, { tier: world.manifest.tier });
    if (card.headline === null) return null;
    return {
      headline: card.headline,
      capture: card.service.capture ?? Number.NaN,
      information: card.information.score,
      arrived: card.service.arrived / Math.max(1, card.service.travellers),
    };
  } finally {
    player.kill();
  }
}

/**
 * A world's profile: every named reference, over `seeds` disruption draws.
 *
 * Only the disruptions change between seeds — same city, same timetable, same
 * conflicts — so the spread this produces is the world's own noise, and it is
 * the only honest bar for "are these two worlds different".
 */
export async function profileWorld(
  repoRoot: string,
  base: World,
  modes: readonly string[],
  seeds: number,
  ports: ProfilePorts,
  onStep?: (label: string) => void,
  extraEnv: Readonly<Record<string, string>> = {},
): Promise<DifficultyProfile> {
  const profile: DifficultyProfile = Object.fromEntries(modes.map((m) => [m, []]));
  for (let i = 0; i < seeds; i++) {
    const world: World = {
      ...base,
      manifest: { ...base.manifest, seed: base.manifest.seed + i * 7919 },
    };
    for (const mode of modes) {
      const point = await measureReference(repoRoot, world, mode, ports, extraEnv);
      if (point) profile[mode]!.push(point);
      onStep?.(`${mode} seed ${i + 1}`);
    }
  }
  return profile;
}

/** The mean headline of one reference, or `null` if it never scored. */
export const headlineOf = (profile: DifficultyProfile, mode: string): number | null => {
  const pts = profile[mode];
  return pts && pts.length > 0 ? mean(pts.map((p) => p.headline)) : null;
};
