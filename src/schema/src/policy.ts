// The disruption policy — how much goes wrong, and how much warning there is.
//
// Specification: DATA-MODEL.md §3, CORECONCEPT.md §3.
//
// **Data, not logic**, and it lives in `@tns/schema` for a reason found the
// expensive way at P1M1. `noticeLeadS` decides the earliest a player can know
// about a disruption; `D-staleness` in the catalogue decides how late an
// operator's feed reports it. **Their relationship decides whether the conflict
// exists at all** — a feed conceals a disruption only when its lag exceeds that
// disruption's announcement lead — and while the two numbers lived in different
// packages, nothing could compare them.
//
// They did not agree. `noticeLeadS[0]` was 300 s; the committed world declared
// staleness of 90 s and 300 s; so no feed in it ever hid anything, and catalogue
// D was decorative for the whole of Phase 0. `KNOWN-ISSUES.md` #19.
//
// Emitted to `contract/catalogue.json` so the generator can hold a setting to
// it. `src/core` owns the drawing; this owns the numbers.

export interface DisruptionPolicy {
  /** Share of journeys that run late. */
  readonly delayRate: number;
  /** Share of journeys that never run at all. */
  readonly cancellationRate: number;
  /** Delay is drawn uniformly from [min, max] seconds. */
  readonly delayRangeS: readonly [number, number];
  /**
   * How long before a journey's scheduled departure the world learns of its
   * disruption, drawn uniformly from [min, max] seconds.
   *
   * Short leads are the interesting ones: they leave a player just enough time
   * to notice and warn somebody, and punish a slow polling cadence.
   *
   * **The minimum is load-bearing beyond this file.** A staleness setting at or
   * below it hides nothing on any operator, however the conflict is placed.
   */
  readonly noticeLeadS: readonly [number, number];
}

export const DEFAULT_DISRUPTION_POLICY: DisruptionPolicy = {
  delayRate: 0.18,
  cancellationRate: 0.06,
  delayRangeS: [120, 900],
  noticeLeadS: [300, 1800],
};
