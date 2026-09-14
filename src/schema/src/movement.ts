// What a traveller physically did, step by step.
//
// Specification: OBSERVABILITY.md §2 ("world consequences") and §9.
//
// **Never logged.** A movement is derived state: it is a pure function of the
// world, the seed and the answers the run log already records, so the viewer
// regenerates movements by replaying the run with an observer attached rather
// than reading them from disk — "log inputs and decisions, never derived state"
// (OBSERVABILITY.md §10). An observer must not influence what it observes;
// the golden hash is what holds the router and the harness to that.

export type Movement =
  /** From the origin (`fromQuay` null), between quays, or to the destination (`toQuay` null). */
  | {
      readonly kind: "walk";
      readonly fromS: number;
      readonly toS: number;
      readonly fromQuay: string | null;
      readonly toQuay: string | null;
    }
  | { readonly kind: "wait"; readonly fromS: number; readonly toS: number; readonly quay: string }
  | {
      readonly kind: "ride";
      readonly fromS: number;
      readonly toS: number;
      readonly journeyId: string;
      readonly fromQuay: string;
      readonly toQuay: string;
      /** How late the vehicle ran, as the world had it. Zero when on time. */
      readonly delayS: number;
    }
  /**
   * The plan stopped working in front of the traveller. `quay` is null when the
   * traveller never reached a quay — an origin it could not walk from.
   */
  | {
      readonly kind: "break";
      readonly atS: number;
      readonly quay: string | null;
      readonly journeyId: string | null;
      readonly reason: string;
    }
  | { readonly kind: "arrive"; readonly atS: number }
  | { readonly kind: "give_up"; readonly atS: number; readonly reason: string };

/** Receives movements as they are simulated. Synchronous, and must not throw. */
export type MovementObserver = (movement: Movement) => void;
