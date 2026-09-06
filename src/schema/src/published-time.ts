// Telling a published epoch in seconds from one in milliseconds.
//
// Specification: CORECONCEPT.md §2.1 B, KNOWN-ISSUES.md #35.
//
// **One place, because it was wrong in two.** `B-time-encoding` offers
// `epoch_s` and `epoch_ms`, and every consumer of a published feed has to tell
// them apart. Two did not:
//
//   * the lazy integration baseline read every number as seconds, so nordline's
//     departures landed 125 days out and `P2` could not board one — it gave up
//     on 158 of 200 journeys and `P1 − P2` went negative (`KNOWN-ISSUES.md`
//     #35);
//   * the reference player did the same thing and then took the result modulo a
//     day, which is worse. `10800000 % 86400` is exactly 0, so milliseconds did
//     not fail loudly — they became **plausible-looking wrong times of day**.
//
// Both claimed in their own docstrings to handle "the shapes" competently. Both
// were fixed by this function rather than separately, because a rule two
// consumers apply independently is a rule they will eventually disagree about —
// which is the lesson `KNOWN-ISSUES.md` #19 left about `noticeLeadS`.
//
// What a feed is *still* allowed to get wrong is the thing that looks like it
// needs no decision: a timestamp with no offset. That is the intended defect
// and this does not touch it.

/**
 * Past this many seconds from the world epoch, a published number is
 * milliseconds rather than seconds.
 *
 * Thirty days. A transit feed spans days, so a departure a month out is not a
 * departure; the same number read as milliseconds is well inside the window.
 * The two encodings differ by a factor of a thousand, so the gap between "too
 * large for seconds" and "plausible as milliseconds" is enormous and no real
 * value sits in it.
 */
export const MILLISECOND_CUTOFF_S = 30 * 24 * 3600;

/**
 * A published epoch number, in seconds, whichever unit it arrived in.
 *
 * Magnitude is the only signal available: nothing in the feed says which unit
 * it uses, which is the whole point of catalogue B. Every real integrator has
 * this heuristic, because every real integrator has met a feed that switched
 * units without telling anyone.
 */
export function publishedEpochSeconds(value: number): number {
  return value > MILLISECOND_CUTOFF_S ? Math.round(value / 1000) : value;
}
