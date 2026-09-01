// Rendering simulated time.
//
// Specification: TIME-MODEL.md §8, PLAYER-CONTRACT.md §7.
//
// Simulated time is a monotonic integer count of seconds from the world epoch.
// This module is the *only* place it becomes a human-readable timestamp, and
// that rendering happens exactly once, at the contract boundary.
//
// Pure integer arithmetic throughout — no `Date`, no transcendental Math. It is
// therefore safe to call from anywhere, including the simulation core, and it
// reproduces identically across engine versions.
//
// The contract surface renders RFC 3339 with an explicit offset. This is
// deliberately the *good* practice the operator APIs will conspicuously fail to
// follow at higher tiers: epoch seconds, epoch milliseconds, local time with no
// offset, `25:10:00` (CORECONCEPT.md §2.1 B).

const SECONDS_PER_DAY = 86400;

/** Howard Hinnant's days_from_civil. Exact integer arithmetic. */
function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Howard Hinnant's civil_from_days. Exact integer arithmetic. */
function civilFromDays(z: number): { y: number; m: number; d: number } {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: m <= 2 ? y + 1 : y, m, d };
}

const pad = (n: number, width: number): string => String(n).padStart(width, "0");

export interface EpochAnchor {
  readonly days: number;
  readonly offsetS: number;
}

/**
 * Parse the world epoch, once, at load time.
 *
 * Expects `YYYY-MM-DDTHH:MM:SS±HH:MM`. The epoch is by definition the instant
 * τ = 0, so its time-of-day component must be midnight.
 */
export function parseEpoch(iso: string): EpochAnchor {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-])(\d{2}):(\d{2})$/.exec(iso);
  if (!m) throw new Error(`world epoch is not RFC 3339 with an explicit offset: ${iso}`);

  const [, y, mo, d, hh, mm, ss, sign, oh, om] = m as unknown as string[];
  if (hh !== "00" || mm !== "00" || ss !== "00") {
    throw new Error(`world epoch must be midnight local time, got ${iso}`);
  }

  const offsetS =
    (sign === "-" ? -1 : 1) * (Number(oh) * 3600 + Number(om) * 60);

  return { days: daysFromCivil(Number(y), Number(mo), Number(d)), offsetS };
}

/** Render τ (seconds from the world epoch) as RFC 3339 with explicit offset. */
export function renderSimTime(anchor: EpochAnchor, tau: number): string {
  const dayShift = Math.floor(tau / SECONDS_PER_DAY);
  const rem = tau - dayShift * SECONDS_PER_DAY;

  const { y, m, d } = civilFromDays(anchor.days + dayShift);
  const hh = Math.floor(rem / 3600);
  const mm = Math.floor((rem - hh * 3600) / 60);
  const ss = rem - hh * 3600 - mm * 60;

  const sign = anchor.offsetS < 0 ? "-" : "+";
  const abs = Math.abs(anchor.offsetS);
  const oh = Math.floor(abs / 3600);
  const om = Math.floor((abs - oh * 3600) / 60);

  return (
    `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}` +
    `T${pad(hh, 2)}:${pad(mm, 2)}:${pad(ss, 2)}` +
    `${sign}${pad(oh, 2)}:${pad(om, 2)}`
  );
}

/** Inverse of {@link renderSimTime}. Used when reading a player's answer back. */
export function parseSimTime(anchor: EpochAnchor, iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-])(\d{2}):(\d{2})$/.exec(iso);
  if (!m) throw new Error(`not RFC 3339 with an explicit offset: ${iso}`);

  const [, y, mo, d, hh, mm, ss, sign, oh, om] = m as unknown as string[];
  const offsetS = (sign === "-" ? -1 : 1) * (Number(oh) * 3600 + Number(om) * 60);
  const days = daysFromCivil(Number(y), Number(mo), Number(d));

  const local = (days - anchor.days) * SECONDS_PER_DAY
    + Number(hh) * 3600 + Number(mm) * 60 + Number(ss);

  // Normalise for a differing offset, so a player may legally answer in UTC.
  return local - (offsetS - anchor.offsetS);
}
