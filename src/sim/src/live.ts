// What a running session looks like, from the records it streams.
//
// Specification: ROADMAP.md P2M8; OBSERVABILITY.md §8; SCORING.md §1.
//
// Everything here is read from the run's own record stream — the same records
// the run file holds — so the dashboard shows what the log will say, and no
// more. **The scorecard is provisional**: material events are derived when a
// run ends (`harness.ts`), so until then Information has nothing to score, and
// capture covers only the travellers already settled. It says so.

import type { Movement, RunRecord } from "@tns/schema";
import { scoreRun } from "@tns/scoring";
import { redactReason, type Disclosure } from "@tns/viewer";

type Obligation = Extract<RunRecord, { kind: "obligation" }>;
type Ingestion = Extract<RunRecord, { kind: "ingestion" }>;
type Traveller = Extract<RunRecord, { kind: "traveller" }>;

export interface OperatorTraffic {
  readonly operator: string;
  calls: number;
  bytes: number;
  errors: number;
  /** Calls in the last simulated hour, for a rate. */
  recentTaus: number[];
}

export interface LiveView {
  readonly obligations: {
    readonly total: number;
    readonly byOutcome: Record<string, number>;
    readonly byKind: Record<string, number>;
    readonly latencyP50Ms: number | null;
    readonly latencyP95Ms: number | null;
    readonly maxLagS: number;
    readonly recent: readonly {
      readonly requestId: string;
      readonly obligation: string;
      readonly issuedAt: number;
      readonly outcome: string;
      readonly latencyMs: number;
      readonly lagS: number | null;
      readonly trigger: string | null;
    }[];
  };
  readonly operators: readonly {
    readonly operator: string;
    readonly calls: number;
    readonly bytes: number;
    readonly errors: number;
    readonly callsLastSimHour: number;
  }[];
  readonly apiCalls: number;
  readonly callBudget: number;
  readonly warnings: readonly { readonly tau: number; readonly travellerRef: string; readonly kind: string; readonly message: string }[];
  readonly warningsSent: number;
  readonly travellersSettled: number;
  readonly travellersArrived: number;
  readonly controls: readonly { readonly tau: number; readonly action: string; readonly timeMode?: string; readonly speed?: number }[];
  readonly runEnd: { readonly reason: string; readonly detail: string } | null;
  readonly provisional: {
    readonly capture: number | null;
    readonly captureNote: string | null;
    readonly scoredTravellers: number;
    readonly verdict: string;
  } | null;
  readonly recentSettled: readonly { readonly travellerRef: string; readonly arrived: boolean; readonly journeyS: number | null; readonly failureReason: string | null; readonly forgone: boolean }[];
}

const RECENT = 40;

export class LiveRun {
  readonly records: RunRecord[] = [];
  /** Where each traveller went, as simulated. Ground truth: canonical quays. */
  readonly movements = new Map<string, Movement[]>();
  #obligations: Obligation[] = [];
  #traffic = new Map<string, OperatorTraffic>();
  #latencies: number[] = [];
  #scoredAtCount = -1;
  #provisional: LiveView["provisional"] = null;

  record(r: RunRecord): void {
    this.records.push(r);
    if (r.kind === "obligation") {
      this.#obligations.push(r);
      if (!r.unsent) this.#latencies.push(r.latencyMs);
    } else if (r.kind === "ingestion") {
      this.#count(r);
    }
  }

  move(travellerRef: string, m: Movement): void {
    let list = this.movements.get(travellerRef);
    if (!list) this.movements.set(travellerRef, (list = []));
    list.push(m);
  }

  #count(c: Ingestion): void {
    let t = this.#traffic.get(c.operator);
    if (!t) this.#traffic.set(c.operator, (t = { operator: c.operator, calls: 0, bytes: 0, errors: 0, recentTaus: [] }));
    t.calls++;
    t.bytes += c.bytes;
    if (c.status >= 400) t.errors++;
    t.recentTaus.push(c.tau);
  }

  /** The view at τ, for one audience. */
  view(tau: number, audience: { disclosure: Disclosure; admin: boolean }, callBudget = 5000): LiveView {
    const full = audience.admin || audience.disclosure === "full";
    const sorted = [...this.#latencies].sort((a, b) => a - b);
    const pct = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]! : null);
    const byOutcome: Record<string, number> = {};
    const byKind: Record<string, number> = {};
    let maxLagS = 0;
    for (const o of this.#obligations) {
      byOutcome[o.outcome] = (byOutcome[o.outcome] ?? 0) + 1;
      byKind[o.obligation] = (byKind[o.obligation] ?? 0) + 1;
      maxLagS = Math.max(maxLagS, o.lagS ?? 0);
    }
    const travellers = this.records.filter((r): r is Traveller => r.kind === "traveller");
    const notifications = this.records.filter((r) => r.kind === "notification") as Extract<RunRecord, { kind: "notification" }>[];

    // Rescored only when something settled, so a busy dashboard costs nothing.
    if (travellers.length !== this.#scoredAtCount && travellers.length > 0) {
      this.#scoredAtCount = travellers.length;
      const card = scoreRun(this.records);
      this.#provisional = {
        capture: card.service.capture,
        captureNote: card.service.captureNote,
        scoredTravellers: card.service.travellers,
        verdict: card.verdict,
      };
    }

    const runEnd = this.records.find((r) => r.kind === "run_end") as Extract<RunRecord, { kind: "run_end" }> | undefined;
    return {
      obligations: {
        total: this.#obligations.length,
        byOutcome,
        byKind,
        latencyP50Ms: pct(0.5),
        latencyP95Ms: pct(0.95),
        maxLagS,
        recent: this.#obligations.slice(-RECENT).reverse().map((o) => ({
          requestId: o.requestId,
          obligation: o.obligation,
          issuedAt: o.issuedAt,
          outcome: o.outcome,
          latencyMs: o.latencyMs,
          lagS: o.lagS ?? null,
          trigger: o.trigger ?? null,
        })),
      },
      operators: [...this.#traffic.values()].map((t) => ({
        operator: t.operator,
        calls: t.calls,
        bytes: t.bytes,
        errors: t.errors,
        callsLastSimHour: t.recentTaus.filter((x) => x > tau - 3600 && x <= tau).length,
      })),
      apiCalls: [...this.#traffic.values()].reduce((a, t) => a + t.calls, 0),
      callBudget,
      warnings: notifications.slice(-RECENT).reverse().map((n) => ({ tau: n.tau, travellerRef: n.travellerRef, kind: n.notificationKind, message: n.message })),
      warningsSent: notifications.length,
      travellersSettled: travellers.length,
      travellersArrived: travellers.filter((t) => t.arrived).length,
      controls: this.records
        .filter((r): r is Extract<RunRecord, { kind: "control" }> => r.kind === "control")
        .map((c) => ({ tau: c.tau, action: c.action, ...(c.timeMode ? { timeMode: c.timeMode } : {}), ...(c.speed ? { speed: c.speed } : {}) })),
      runEnd: runEnd ? { reason: runEnd.reason, detail: runEnd.detail } : null,
      provisional: this.#provisional,
      recentSettled: travellers.slice(-RECENT).reverse().map((t) => ({
        travellerRef: t.travellerRef,
        arrived: t.arrived,
        journeyS: t.journeyS,
        // A failure reason can name a canonical quay (OBSERVABILITY.md §8).
        failureReason: redactReason(t.failureReason, full),
        forgone: t.forgone,
      })),
    };
  }
}
