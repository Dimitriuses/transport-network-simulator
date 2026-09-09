// The second axis: what shape of place this is.
//
// Specification: ROADMAP.md P1M7, KNOWN-ISSUES.md #48, CORECONCEPT.md §7.
//
// **Scale is ordered and shape is not, and keeping them apart is the point.**
//
// A tier says how much there is to integrate: a small town with two bus
// companies, up to a region with six operators and a metro. That is a ladder,
// it is climbed, and a clearance bar can be attached to each rung.
//
// A shape says what *kind* of place it is. One city with a centre, or several
// towns joined by rail — and those are different problems rather than different
// amounts of one problem. Ordering them would mean deciding that five towns and
// a railway are, say, twenty per cent harder than one large city, which is a
// number nobody could defend and which the clearance ladder would then inherit.
//
// So a world declares **`(tier, shape)`**, the tier is the index into `LADDER`,
// and the shape is chosen when the world is built. `P1M7`'s exit is that two
// worlds of one tier and different shapes agree within noise — which is the
// claim that makes this an axis rather than a difficulty lever wearing a
// different name. If polycentric turns out to be reliably harder, it is not a
// shape: it is a rung, and the measurement will say so.

/** What kind of place a world is. */
export type WorldShape =
  | "single-centre"
  | "polycentric-rail"
  | "polycentric-bus"
  | "polycentric-mixed";

/**
 * How the towns of a region are joined.
 *
 * **The link is the problem.** A railway is fast and infrequent, so a missed
 * connection is forty minutes and the interchange sits on the critical path. A
 * coach is slower and more frequent, which forgives a bad plan and asks a
 * different question. **Both at once asks the hardest one**: two ways between
 * the same two towns, run by two operators, publishing two different pictures
 * of the same journey — which is the whole subject of this game, at the scale
 * of a region rather than a street corner.
 */
export type RegionLink = "rail" | "bus" | "both";

export interface ShapeSpec {
  readonly id: WorldShape;
  /** What it is, for a report to print. */
  readonly name: string;
  /**
   * Centres the network is built around.
   *
   * One is a city: a hub, radials through it, a ring around it. Several are
   * towns, each with its own small network and its own local operators, joined
   * by rail — and **the rail is infrequent**, which is what makes a missed
   * connection expensive and an integration worth having. A bus every ten
   * minutes forgives a bad plan; a train every forty does not.
   */
  readonly centres: number;
  /** Metres between neighbouring centres, when there is more than one. */
  readonly centreSpacingM: number;
  /** How the towns are joined. Meaningless when there is one centre. */
  readonly link: RegionLink;
}

export const SHAPES: readonly ShapeSpec[] = [
  {
    id: "single-centre",
    name: "one city, built around its centre",
    centres: 1,
    centreSpacingM: 0,
    link: "rail",
  },
  {
    id: "polycentric-rail",
    name: "several towns, joined by rail",
    centres: 3,
    // Far enough that walking between towns is never an option and the link is
    // the only way across, which is what puts the interchange on the critical
    // path rather than beside it.
    centreSpacingM: 9000,
    link: "rail",
  },
  {
    id: "polycentric-bus",
    name: "several towns, joined by coach",
    centres: 3,
    centreSpacingM: 9000,
    link: "bus",
  },
  {
    id: "polycentric-mixed",
    name: "several towns, joined by rail and by coach",
    centres: 3,
    centreSpacingM: 9000,
    link: "both",
  },
];

export const DEFAULT_SHAPE: WorldShape = "single-centre";

/** The shape with an id, or `null` — never a default, which would hide a typo. */
export const shapeById = (id: string): ShapeSpec | null =>
  SHAPES.find((s) => s.id === id) ?? null;
