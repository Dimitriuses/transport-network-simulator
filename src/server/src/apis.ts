// Operator and control HTTP APIs.
//
// Specification: PLAYER-CONTRACT.md §6.
//
// These are the boundary. Async, wall clock and I/O are all fine here — the
// determinism rules bind src/core and src/router, not the servers. What the
// servers must never do is let any of that reach the model.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import type { World } from "@tns/schema";
import { renderSimTime, parseEpoch, CONTRACT_VERSION, NotifyRequest } from "@tns/schema";
import { projectOperator, projectRealtime, operatorDocs, type Projection } from "@tns/projections";
import type { Disruption } from "@tns/core";
import { operatorSite } from "@tns/portal";
import {
  ABORT_AFTER_CONSECUTIVE_FAILURES,
  MIN_TICK_INTERVAL_S,
  PREPARATION_WALL_BUDGET_S,
  RUN_WALL_BUDGET_S,
} from "./limits.ts";

export { MIN_TICK_INTERVAL_S } from "./limits.ts";

/**
 * Whether a request wants pages rather than JSON: a browser does, an HTTP
 * client asking for JSON or naming nothing does not. JSON stays the default, so
 * nothing that read `/docs` before P2M7 reads anything different.
 */
export function wantsHtml(accept: string | undefined): boolean {
  if (!accept) return false;
  const html = accept.indexOf("text/html");
  const json = accept.indexOf("application/json");
  return html >= 0 && (json < 0 || html < json);
}

export interface OperatorCall {
  readonly tau: number;
  readonly endpoint: string;
  readonly status: number;
  readonly bytes: number;
  readonly bodyHash: string;
  /** The body served, for a `verbatim` writer. Already built for the response, so free. */
  readonly body: string;
}

function send(res: ServerResponse, status: number, body: unknown): number {
  const payload = JSON.stringify(body);
  const bytes = Buffer.byteLength(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": bytes,
  });
  res.end(payload);
  return bytes;
}

/**
 * The operator API.
 *
 * Every response is a pure function of (endpoint, params, τ). It never depends
 * on wall time and never on how many times it has been called — the snapshot
 * rule (PLAYER-CONTRACT.md §6.4). The projection cache below makes that
 * structural rather than aspirational: two calls at the same τ return the same
 * object, so they cannot differ even by accident.
 */
export function startOperatorApi(
  world: World,
  operatorId: string,
  disruptions: readonly Disruption[],
  readTau: () => number,
  onCall: (call: OperatorCall) => void,
  port: number,
  /**
   * Whether a call may be served now. During a manual pause it waits and then
   * says yes, or says no when too many are already waiting — a `503`
   * (PLAYER-CONTRACT.md §6.4, `control.ts`). Absent, every call is served.
   */
  admit?: () => Promise<boolean>,
): Promise<Server> {
  const manifest = world.manifest.operators.find((o) => o.id === operatorId)!.manifest as {
    realtime: Parameters<typeof projectRealtime>[3];
  };
  const cache = new Map<number, { projection: Projection; body: string; hash: string }>();
  const rtCache = new Map<number, { body: string; hash: string }>();

  const projectionAt = (tau: number) => {
    let entry = cache.get(tau);
    if (!entry) {
      const projection = projectOperator(world, operatorId, tau);
      const body = JSON.stringify(projection.timetable);
      const hash = createHash("sha256").update(body).digest("hex").slice(0, 16);
      cache.set(tau, (entry = { projection, body, hash }));
    }
    return entry;
  };

  // Realtime, cached per τ for the same reason the timetable is: the snapshot
  // rule is enforced structurally, not by discipline. Two calls at one τ cannot
  // differ even by accident (PLAYER-CONTRACT.md §6.4).
  const realtimeAt = (tau: number) => {
    let entry = rtCache.get(tau);
    if (!entry) {
      const body = JSON.stringify(
        projectRealtime(world, operatorId, disruptions, manifest.realtime, tau),
      );
      const hash = createHash("sha256").update(body).digest("hex").slice(0, 16);
      rtCache.set(tau, (entry = { body, hash }));
    }
    return entry;
  };

  // Independent of τ, unlike every other response here: an operator's
  // documentation describes its format, and its format does not change during a
  // run. Built once so the snapshot rule holds trivially.
  const docs = operatorDocs(world, operatorId);
  const docsBody = JSON.stringify(docs);
  const docsHash = createHash("sha256").update(docsBody).digest("hex").slice(0, 16);

  const server = createServer((req, res) => {
    if (!admit) return serve(req, res);
    void admit().then((ok) => {
      if (ok) return serve(req, res);
      const bytes = send(res, 503, { title: "service unavailable", status: 503 });
      onCall({ tau: readTau(), endpoint: `${req.method} ${req.url ?? "/"}`, status: 503, bytes, bodyHash: "", body: "" });
    });
  });

  // τ is read when a call is served, not when it arrived: a call that waited out
  // a pause is answered with the world as it stands after it.
  function serve(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? "/", "http://localhost");
    const tau = readTau();

    if (req.method === "GET" && url.pathname === "/realtime") {
      const entry = realtimeAt(tau);
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(entry.body),
      });
      res.end(entry.body);
      onCall({
        tau,
        endpoint: "GET /realtime",
        status: 200,
        bytes: Buffer.byteLength(entry.body),
        bodyHash: entry.hash,
        body: entry.body,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/timetable") {
      const entry = projectionAt(tau);
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(entry.body),
      });
      res.end(entry.body);
      onCall({
        tau,
        endpoint: "GET /timetable",
        status: 200,
        bytes: Buffer.byteLength(entry.body),
        bodyHash: entry.hash,
        body: entry.body,
      });
      return;
    }

    // The brief advertises this URL for every operator (PLAYER-CONTRACT.md
    // §6.1) and until P1M1 nothing served it. Generated from the same manifest
    // that drives the projection, so behaviour and description cannot drift —
    // and describing format only, never accuracy (see `docs.ts`).
    //
    // Logged like any other call: reading the documentation is part of what a
    // player did, and `OBSERVABILITY.md` should be able to see that it happened.
    // Pages for a browser, the same content the JSON carries (P2M7). Logged under
    // their own endpoint names, so a run log can say which a player read and the
    // viewer can regenerate either. Both are independent of τ.
    const docsPage = /^\/docs(?:\/(\w+))?$/.exec(url.pathname);
    if (req.method === "GET" && docsPage && (docsPage[1] !== undefined || wantsHtml(req.headers.accept))) {
      const subpage = docsPage[1] ?? "";
      let html: string;
      try {
        html = operatorSite(world, operatorId, subpage);
      } catch {
        const bytes = send(res, 404, { title: "not found", status: 404 });
        onCall({ tau, endpoint: `GET ${url.pathname}`, status: 404, bytes, bodyHash: "", body: "" });
        return;
      }
      const bytes = Buffer.byteLength(html);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-length": bytes });
      res.end(html);
      const hash = createHash("sha256").update(html).digest("hex").slice(0, 16);
      onCall({ tau, endpoint: `GET ${url.pathname} (html)`, status: 200, bytes, bodyHash: hash, body: html });
      return;
    }

    if (req.method === "GET" && (url.pathname === "/docs" || url.pathname === "/docs/openapi.json")) {
      const bytes = send(res, 200, docs);
      onCall({ tau, endpoint: "GET /docs", status: 200, bytes, bodyHash: docsHash, body: docsBody });
      return;
    }

    const notFound = { title: "not found", status: 404 };
    const bytes = send(res, 404, notFound);
    onCall({
      tau,
      endpoint: `${req.method} ${url.pathname}`,
      status: 404,
      bytes,
      bodyHash: "",
      body: JSON.stringify(notFound),
    });
  }

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

export interface NotificationRecord {
  readonly tau: number;
  readonly travellerRef: string;
  readonly kind: string;
  readonly message: string;
}


export interface BriefAccess {
  /** How many operator calls may wait out a manual pause. */
  readonly pauseQueueDepth: number;
}

type Pacing = { readonly mode: "virtual" | "realtime" | "scaled"; readonly speed: number };
type Loop = { readonly mode: "open" | "closed"; readonly appUserFraction: number };

/**
 * The brief, as `/v1/brief` serves it (PLAYER-CONTRACT.md §6.1).
 *
 * A function rather than a literal inside the handler (P2M8), so `run-start`
 * can carry a digest of exactly what a player reads.
 */
export function buildBrief(
  world: World,
  operatorBaseUrls: ReadonlyMap<string, string>,
  pacing: Pacing,
  loop: Loop,
  access: BriefAccess,
): Record<string, unknown> {
  return {
    contract_version: CONTRACT_VERSION,
    run_id: "m1-demo",
    world: {
      seed: world.manifest.seed,
      engine_version: world.manifest.engineVersion,
      timezone: world.manifest.timezone,
      // Stated here and nowhere else. An operator publishing local time
      // with no offset is undecodable without it (catalogue §2.1 B).
      utc_offset: (world.manifest.utcOffsetS < 0 ? "-" : "+") +
        String(Math.floor(Math.abs(world.manifest.utcOffsetS) / 3600)).padStart(2, "0") +
        ":" +
        String(Math.floor((Math.abs(world.manifest.utcOffsetS) % 3600) / 60)).padStart(2, "0"),
    },
    run: {
      // Budgets the simulator enforces (limits.ts). A wall budget means
      // something only where wall time is the machine's, not the day's.
      wall_budget_s: pacing.mode === "virtual" ? RUN_WALL_BUDGET_S : null,
      pause_queue_depth: access.pauseQueueDepth,
      abort_after_consecutive_failures: ABORT_AFTER_CONSECUTIVE_FAILURES,
      mode: loop.mode === "closed" ? "closed_loop" : "open_loop",
      ...(loop.mode === "closed" ? { app_user_fraction: loop.appUserFraction } : {}),
      cold_start: true,
      tier: world.manifest.tier,
      time_mode: pacing.mode,
      latency_mode: "none",
    },
    preparation: { wall_budget_s: PREPARATION_WALL_BUDGET_S },
    // Where the operators are and how to reach them. Nothing about their
    // schemas, their quality, or how their data relates — discovering that
    // is the game (PLAYER-CONTRACT.md §6.1).
    operators: world.manifest.operators.map((op) => ({
      id: op.id,
      name: op.name,
      base_url: operatorBaseUrls.get(op.id) ?? "",
      docs_url: `${operatorBaseUrls.get(op.id) ?? ""}/docs`,
      auth: { scheme: "none" },
    })),
    obligations: ["plan", "replan", "tick", "notify"],
    // Rules of the world, not facts about the operators. A traveller will
    // not walk further than `max_walk_m` to reach their first stop or from
    // their last, and walks at `walk_speed_mps` — and the simulator
    // *enforces* both when it charges an itinerary.
    //
    // Published here because until P0M9 it did not publish them at all,
    // and a rule the world enforces but never states is not a conflict to
    // be discovered, it is an unfair world. The reference player searched
    // 500 m for a boarding point while the simulator refused anything past
    // 400 m, so it planned journeys that were rejected as
    // `origin_unreachable` — 49 of 132 travellers once the city grew, at
    // which point declining every obligation outscored trying.
    limits: {
      min_tick_interval_sim_s: MIN_TICK_INTERVAL_S,
      max_walk_m: world.manifest.maxWalkM,
      walk_speed_mps: world.manifest.walkSpeedMps,
    },
  };
}

/** SHA-256 of the brief's JSON, as served (PLAYER-CONTRACT.md §5.7). */
export function briefDigest(brief: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(brief)).digest("hex");
}

/** The control API: the brief, the simulated clock, and dissemination. */
export function startControlApi(
  world: World,
  readTau: () => number,
  readState: () => "preparation" | "running" | "paused" | "ended",
  operatorBaseUrls: ReadonlyMap<string, string>,
  onNotify: (n: NotificationRecord) => void,
  port: number,
  /**
   * What the brief and `/v1/clock` report. The run's own, never assumed
   * (TIME-MODEL.md §2) — and read on every request, because a run's mode and
   * speed can change while it runs (P2M8).
   */
  pacingNow:
    | { readonly mode: "virtual" | "realtime" | "scaled"; readonly speed: number }
    | (() => { readonly mode: "virtual" | "realtime" | "scaled"; readonly speed: number }) = {
    mode: "virtual",
    speed: 1,
  },
  /**
   * Whether the scored travellers' choices reach the world (SCORING.md §12).
   * `app_user_fraction` is stated only in closed loop, so an open-loop brief is
   * what it always was.
   */
  loop: { readonly mode: "open" | "closed"; readonly appUserFraction: number } = {
    mode: "open",
    appUserFraction: 1,
  },
  /**
   * The run token, when the run has one (PLAYER-CONTRACT.md §3): every request
   * must then carry `Authorization: Bearer <token>` and `X-TNS-Contract`.
   */
  access: BriefAccess & { readonly token?: string } = { pauseQueueDepth: 256 },
): Promise<Server> {
  const anchor = parseEpoch(world.manifest.worldEpochIso);

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const pacing = typeof pacingNow === "function" ? pacingNow() : pacingNow;

    // The stray caller §3 names: without the run's token nobody reads the brief
    // or warns a traveller in a scored run. The clock is guarded too: it is
    // unmetered, not public.
    if (access.token !== undefined) {
      if (req.headers.authorization !== `Bearer ${access.token}`) {
        res.setHeader("www-authenticate", 'Bearer realm="control"');
        return void send(res, 401, {
          title: "unauthorized",
          status: 401,
          detail: "this run requires `Authorization: Bearer <run token>` (PLAYER-CONTRACT.md §3)",
        });
      }
      const version = req.headers["x-tns-contract"];
      if (version !== CONTRACT_VERSION) {
        return void send(res, 400, {
          title: "contract version",
          status: 400,
          detail: `send \`X-TNS-Contract: ${CONTRACT_VERSION}\`; got ${version === undefined ? "none" : JSON.stringify(version)}`,
        });
      }
    }

    if (req.method === "GET" && url.pathname === "/v1/brief") {
      return void send(res, 200, buildBrief(world, operatorBaseUrls, pacing, loop, access));
    }

    if (req.method === "GET" && url.pathname === "/v1/clock") {
      // Never queued, even during a manual pause: otherwise the player cannot
      // discover why its other calls have stalled (TIME-MODEL.md §3).
      return void send(res, 200, {
        sim_time: renderSimTime(anchor, readTau()),
        state: readState(),
        time_mode: pacing.mode,
        speed: pacing.speed,
      });
    }

    // The scored dissemination channel. The simulator stamps arrival itself:
    // `sent_at` from the player is advisory only, because trusting a
    // player-supplied timestamp would be an obvious cheat on the very metric
    // this endpoint exists to measure (PLAYER-CONTRACT.md §6.3).
    if (req.method === "POST" && url.pathname === "/v1/notify") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        let json: unknown;
        try {
          json = JSON.parse(body);
        } catch {
          return void send(res, 400, { title: "malformed body", status: 400 });
        }
        // The published schema, not a reading of it (`contract/control-api.yaml`).
        const n = NotifyRequest.safeParse(json);
        if (!n.success) {
          const issue = n.error.issues[0];
          return void send(res, 400, {
            title: "not a notification",
            status: 400,
            detail: issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : undefined,
          });
        }
        onNotify({ tau: readTau(), travellerRef: n.data.traveller_ref, kind: n.data.kind, message: n.data.message });
        send(res, 202, { accepted: true });
      });
      return;
    }

    send(res, 404, { title: "not found", status: 404 });
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
