// What each declared conflict cost one player — SCORING.md §10, stage two.
//
// Leave-one-in, as `ablate` measures `P2rt`: the player is run on the world with
// every value-level conflict switched off, and again with each switched back on
// alone. `P1` and `P0a` do not read the projections, so every variant shares the
// run's scale and a capture difference is the conflict's alone. The rows
// over-sum on purpose: a loss two conflicts would each have caused alone is
// counted in both, and that overlap is the redundancy itself.
//
// Written by `npm run attribute`, read by the viewer, and disclosed by section
// or by conflict according to OBSERVABILITY.md §8.

import { CATALOGUE, type CatalogueSection } from "@tns/schema";
import type { Disclosure } from "./timeline.ts";

export interface PlayerAttribution {
  readonly kind: "player_attribution";
  /** How the player was run, for the reader: a reference mode or a command. */
  readonly player: string;
  readonly worldContentHash: string;
  readonly captureDeclared: number;
  readonly captureClean: number;
  readonly entries: readonly {
    /** `C-coordinate-offset:nordline`, as the manifest declares it. */
    readonly conflict: string;
    readonly capture: number;
    /** `captureClean − capture`: positive is what switching it on alone cost. */
    readonly captureLost: number;
  }[];
}

export interface DisclosedAttribution {
  readonly player: string;
  readonly captureDeclared: number;
  readonly captureClean: number;
  readonly sections: readonly { readonly section: CatalogueSection; readonly captureLost: number; readonly conflicts: number }[];
  /** `full` only: which operator and which setting is the answer key (§8). */
  readonly conflicts: PlayerAttribution["entries"] | null;
}

const sectionOf = new Map(CATALOGUE.map((c) => [c.conflict, c.section]));

export function discloseAttribution(a: PlayerAttribution, level: Disclosure): DisclosedAttribution | null {
  if (level === "outcome") return null;
  const bySection = new Map<CatalogueSection, { captureLost: number; conflicts: number }>();
  for (const e of a.entries) {
    const section = sectionOf.get(e.conflict.split(":")[0] ?? "");
    if (!section) continue;
    const s = bySection.get(section) ?? { captureLost: 0, conflicts: 0 };
    s.captureLost += e.captureLost;
    s.conflicts++;
    bySection.set(section, s);
  }
  return {
    player: a.player,
    captureDeclared: a.captureDeclared,
    captureClean: a.captureClean,
    sections: [...bySection]
      .map(([section, s]) => ({ section, ...s }))
      .sort((x, y) => (x.section < y.section ? -1 : 1)),
    conflicts: level === "full" ? a.entries : null,
  };
}
