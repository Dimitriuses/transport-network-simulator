// The event queue.
//
// A binary heap over (τ, rank, sequence). Ties are broken by rank, then by
// insertion sequence, and
// that is not optional: without deterministic tie-breaking, event order at
// equal timestamps is an implementation detail and reproducibility is gone.
// The benchmark measured the cost at roughly a third of throughput and it is
// still mandatory (benchmarks/README.md, TECHNICAL-RESEARCH.md §11).
//
// Struct-of-arrays over TypedArrays is the measured-faster representation for
// the hot path, but P0M1's event volume is trivial. This deliberately stays a
// plain readable heap until there is a measurement saying otherwise — the
// benchmark exists precisely so that switch can be made on evidence.

export interface Event<T> {
  readonly tau: number;
  readonly payload: T;
}

export class EventQueue<T> {
  #tau: number[] = [];
  /**
   * Which of two events at one instant goes first, before insertion order.
   *
   * Added at P2M8, when ticks began to be scheduled one at a time: until then
   * "a tick at an obligation's instant comes first" (PLAYER-CONTRACT.md §5.6)
   * was kept by queueing every tick of the day before any plan, which a tick
   * rescheduled mid-run cannot do (`KNOWN-ISSUES.md` #67). A rule the order of
   * `push` calls happened to keep is now a rule the queue keeps.
   */
  #rank: number[] = [];
  #seq: number[] = [];
  #payload: T[] = [];
  #next = 0;

  get size(): number {
    return this.#tau.length;
  }

  #less(i: number, j: number): boolean {
    const ti = this.#tau[i]!;
    const tj = this.#tau[j]!;
    if (ti !== tj) return ti < tj;
    const ri = this.#rank[i]!;
    const rj = this.#rank[j]!;
    return ri < rj || (ri === rj && this.#seq[i]! < this.#seq[j]!);
  }

  #swap(i: number, j: number): void {
    [this.#tau[i], this.#tau[j]] = [this.#tau[j]!, this.#tau[i]!];
    [this.#rank[i], this.#rank[j]] = [this.#rank[j]!, this.#rank[i]!];
    [this.#seq[i], this.#seq[j]] = [this.#seq[j]!, this.#seq[i]!];
    [this.#payload[i], this.#payload[j]] = [this.#payload[j]!, this.#payload[i]!];
  }

  /** `rank` orders events at one instant: lower first. Defaults to 0. */
  push(tau: number, payload: T, rank = 0): void {
    this.#tau.push(tau);
    this.#rank.push(rank);
    this.#seq.push(this.#next++);
    this.#payload.push(payload);

    let i = this.#tau.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.#less(i, parent)) break;
      this.#swap(i, parent);
      i = parent;
    }
  }

  pop(): Event<T> | undefined {
    const n = this.#tau.length;
    if (n === 0) return undefined;

    const out = { tau: this.#tau[0]!, payload: this.#payload[0]! };

    this.#swap(0, n - 1);
    this.#tau.pop();
    this.#rank.pop();
    this.#seq.pop();
    this.#payload.pop();

    const size = this.#tau.length;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < size && this.#less(l, m)) m = l;
      if (r < size && this.#less(r, m)) m = r;
      if (m === i) break;
      this.#swap(i, m);
      i = m;
    }

    return out;
  }

  peekTau(): number | undefined {
    return this.#tau[0];
  }
}
