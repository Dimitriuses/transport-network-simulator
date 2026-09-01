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
import { projectOperator, type Projection } from "@tns/projections";

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
  readTau: () => number,
  onCall: (call: OperatorCall) => void,
  port: number,
): Promise<Server> {
  const cache = new Map<number, { projection: Projection; body: string; hash: string }>();

  const projectionAt = (tau: number) => {
    let entry = cache.get(tau);
    if (!entry) {
      const projection = projectOperator(world, tau);
      const body = JSON.stringify(projection.timetable);
      const hash = createHash("sha256").update(body).digest("hex").slice(0, 16);
      cache.set(tau, (entry = { projection, body, hash }));
    }
    return entry;
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const tau = readTau();

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

/** The control API: the brief and the simulated clock. */
export function startControlApi(
  world: World,
  readTau: () => number,
  readState: () => "preparation" | "running" | "paused" | "ended",
  operatorBaseUrl: string,
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
        },
        run: {
          mode: "open_loop",
          cold_start: true,
          tier: world.manifest.tier,
          time_mode: "virtual",
          latency_mode: "none",
        },
        operators: [
          {
            id: world.manifest.operatorId,
            name: world.manifest.operatorName,
            base_url: operatorBaseUrl,
            docs_url: `${operatorBaseUrl}/docs`,
            auth: { scheme: "none" },
          },
        ],
        obligations: ["plan"],
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

    send(res, 404, { title: "not found", status: 404 });
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
