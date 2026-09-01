// Operator and control HTTP APIs.
//
// Specification: PLAYER-CONTRACT.md §6.
//
// These are the boundary. Async, wall clock and I/O are all fine here — the
// determinism rules bind src/core and src/router, not the servers. What the
// servers must never do is let any of that reach the model.

import { createServer, type Server, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import type { World } from "@tns/schema";
import { renderSimTime, parseEpoch, CONTRACT_VERSION } from "@tns/schema";
import { projectOperator, projectRealtime, type Projection } from "@tns/projections";
import type { Disruption } from "@tns/core";

export interface OperatorCall {
  readonly tau: number;
  readonly endpoint: string;
  readonly status: number;
  readonly bytes: number;
  readonly bodyHash: string;
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

  const server = createServer((req, res) => {
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
      });
      return;
    }

    const bytes = send(res, 404, { title: "not found", status: 404 });
    onCall({ tau, endpoint: `${req.method} ${url.pathname}`, status: 404, bytes, bodyHash: "" });
  });

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

/** The control API: the brief, the simulated clock, and dissemination. */
export function startControlApi(
  world: World,
  readTau: () => number,
  readState: () => "preparation" | "running" | "paused" | "ended",
  operatorBaseUrls: ReadonlyMap<string, string>,
  onNotify: (n: NotificationRecord) => void,
  port: number,
): Promise<Server> {
  const anchor = parseEpoch(world.manifest.worldEpochIso);

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/v1/brief") {
      return void send(res, 200, {
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
          mode: "open_loop",
          cold_start: true,
          tier: world.manifest.tier,
          time_mode: "virtual",
          latency_mode: "none",
        },
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
        obligations: ["plan", "tick", "notify"],
        limits: { min_tick_interval_sim_s: 5 },
      });
    }

    if (req.method === "GET" && url.pathname === "/v1/clock") {
      // Never queued, even during a manual pause: otherwise the player cannot
      // discover why its other calls have stalled (TIME-MODEL.md §3).
      return void send(res, 200, {
        sim_time: renderSimTime(anchor, readTau()),
        state: readState(),
        time_mode: "virtual",
        speed: 1.0,
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
        try {
          const n = JSON.parse(body) as {
            traveller_ref?: string;
            kind?: string;
            message?: string;
          };
          if (!n.traveller_ref) return void send(res, 400, { title: "traveller_ref required", status: 400 });
          onNotify({
            tau: readTau(),
            travellerRef: n.traveller_ref,
            kind: n.kind ?? "info",
            message: n.message ?? "",
          });
          send(res, 202, { accepted: true });
        } catch {
          send(res, 400, { title: "malformed body", status: 400 });
        }
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
