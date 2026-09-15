// The simulation server's HTTP surface: the dashboard, its API, and a live stream.
//
// Specification: ROADMAP.md P2M8; PLAYER-CONTRACT.md §3; OBSERVABILITY.md §8.
//
// **Two audiences, two keys** (decided 2026-09-15). The administrator's token
// is printed when the server starts and opens everything: configuration,
// control, and ground truth. A solution's own run token opens that solution's
// view, which shows what the run's disclosure level allows and changes nothing.
// Bound to 127.0.0.1, because a dashboard able to stop a run is not for the
// network.

import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, relative, resolve } from "node:path";

import { buildMap, redactReason, type Disclosure } from "@tns/viewer";
import { Session, type SessionConfig, type SessionPorts } from "./session.ts";

export interface SimServerOptions {
  readonly port: number;
  readonly repoRoot: string;
  readonly ports: SessionPorts;
  readonly runDir: string;
  /** Fixed in tests; drawn otherwise. */
  readonly adminToken?: string;
  /** Where "open in viewer" starts a viewer. */
  readonly viewerPort?: number;
}

export interface SimServer {
  readonly server: Server;
  readonly adminToken: string;
  readonly url: string;
  session(): Session | null;
  close(): Promise<void>;
}

type Audience = { admin: true } | { admin: false; solutionToken: string };

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const same = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

function cookie(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

/** Every world bundle a session could be created on. */
export function listWorlds(repoRoot: string): string[] {
  const out: string[] = [];
  for (const dir of ["worlds", join("worlds", "scratch")]) {
    try {
      for (const f of readdirSync(join(repoRoot, dir))) {
        if (f.endsWith(".world.db") && !f.includes(".candidate.")) out.push(join(dir, f).replaceAll("\\", "/"));
      }
    } catch {
      // A directory that is not there has no worlds in it.
    }
  }
  return out.sort((a, b) => (a.startsWith("worlds/scratch") === b.startsWith("worlds/scratch") ? a.localeCompare(b) : a.startsWith("worlds/scratch") ? 1 : -1));
}

export function startSimServer(opts: SimServerOptions): Promise<SimServer> {
  const adminToken = opts.adminToken ?? randomBytes(18).toString("base64url");
  const publicDir = resolve(opts.repoRoot, "src", "sim", "public");
  let session: Session | null = null;
  let viewer: ChildProcess | null = null;

  const audienceOf = (req: IncomingMessage, url: URL): Audience | null => {
    const bearer = req.headers.authorization?.replace(/^Bearer /, "");
    const offered = bearer ?? url.searchParams.get("token") ?? cookie(req, "tns_admin") ?? cookie(req, "tns_player");
    if (!offered) return null;
    if (same(offered, adminToken)) return { admin: true };
    const s = session?.solution;
    if (s && same(offered, s.token)) return { admin: false, solutionToken: s.token };
    return null;
  };

  /** The snapshot one audience may see. */
  const snapshot = (audience: Audience) => {
    if (!session) return { session: null, worlds: audience.admin ? listWorlds(opts.repoRoot) : [] };
    const clock = session.clock();
    const disclosure: Disclosure = session.config.disclosure;
    const summary = session.summary();
    const solution = session.solution;
    return {
      role: audience.admin ? "admin" : "player",
      session: {
        ...summary,
        // The operators a player may know about; the file name a player need not.
        world: audience.admin ? summary.world : { ...summary.world, file: undefined },
      },
      solution: solution
        ? {
            id: solution.id,
            baseUrl: solution.baseUrl,
            kind: solution.kind,
            mode: solution.mode ?? null,
            // The token is shown to the administrator who hands it out, and to
            // the solution that already holds it.
            token: solution.token,
          }
        : null,
      clock: { ...clock, state: session.state },
      live: session.live.view(clock.tau, { disclosure, admin: audience.admin }),
      mapAvailable: audience.admin || disclosure === "full",
      worlds: audience.admin ? listWorlds(opts.repoRoot) : [],
    };
  };

  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const path = url.pathname;

      // ---- pages -----------------------------------------------------------
      if (req.method === "GET" && (path === "/" || path === "/player")) {
        const audience = audienceOf(req, url);
        if (!audience || (path === "/" && !audience.admin)) {
          res.writeHead(401, { "content-type": "text/html; charset=utf-8" });
          return void res.end(
            `<!doctype html><meta charset="utf-8"><title>Simulation</title><body style="font:15px system-ui;margin:40px">` +
              `<h1>Not signed in</h1><p>${path === "/" ? "Open the link the simulation server printed when it started." : "Open <code>/player?token=&lt;your run token&gt;</code>."}</p>`,
          );
        }
        const offered = url.searchParams.get("token");
        if (offered) {
          // Keep the token out of the address bar once it has been read.
          res.writeHead(303, {
            "set-cookie": `${audience.admin ? "tns_admin" : "tns_player"}=${encodeURIComponent(offered)}; HttpOnly; SameSite=Strict; Path=/`,
            location: path,
          });
          return void res.end();
        }
        const html = readFileSync(join(publicDir, "dashboard.html"), "utf8").replace("__ROLE__", audience.admin ? "admin" : "player");
        res.writeHead(200, { "content-type": TYPES[".html"]!, "cache-control": "no-store" });
        return void res.end(html);
      }
      if (req.method === "GET" && /^\/(dashboard\.js|dashboard\.css)$/.test(path)) {
        res.writeHead(200, { "content-type": TYPES[extname(path)]! });
        return void res.end(readFileSync(join(publicDir, path.slice(1))));
      }

      // ---- API ---------------------------------------------------------------
      if (!path.startsWith("/api/")) return json(res, 404, { error: "not found" });
      const audience = audienceOf(req, url);
      if (!audience) return json(res, 401, { error: "a token is required: the administrator's, or a solution's own" });

      if (req.method === "GET" && path === "/api/state") return json(res, 200, snapshot(audience));

      if (req.method === "GET" && path === "/api/events") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        const send = () => res.write(`data: ${JSON.stringify(snapshot(audience))}\n\n`);
        send();
        const timer = setInterval(send, 500);
        req.on("close", () => clearInterval(timer));
        return;
      }

      if (req.method === "GET" && path === "/api/map") {
        if (!session) return json(res, 404, { error: "no session" });
        if (!audience.admin && session.config.disclosure !== "full") {
          return json(res, 403, { error: "the map shows true positions and the day's disruptions, which this run's disclosure withholds (OBSERVABILITY.md §8)" });
        }
        const full = true;
        return json(res, 200, {
          ...buildMap(session.world),
          travellers: Object.fromEntries(
            [...session.live.movements].map(([ref, moves]) => [
              ref,
              moves.map((m) =>
                m.kind === "give_up" || m.kind === "break" ? { ...m, reason: redactReason(m.reason, full) } : m,
              ),
            ]),
          ),
        });
      }

      if (!audience.admin) return json(res, 403, { error: "a solution's token opens its view, and changes nothing" });

      try {
        const body = req.method === "POST" ? await readJson(req) : {};
        if (req.method === "POST" && path === "/api/session") {
          if (session && !["ended", "failed", "configured", "preparation", "ready"].includes(session.state)) {
            return json(res, 409, { error: `the current session is ${session.state}; stop it first` });
          }
          session?.dispose();
          const worldPath = resolve(opts.repoRoot, String(body["world"] ?? "worlds/m1.world.db"));
          if (relative(opts.repoRoot, worldPath).startsWith("..")) return json(res, 400, { error: "a world must be inside the repository" });
          const config: SessionConfig = {
            worldPath,
            loop: body["loop"] === "closed" ? "closed" : "open",
            ...(body["loop"] === "closed" ? { appUserFraction: Number(body["appUserFraction"] ?? 1) } : {}),
            timeMode: (["virtual", "realtime", "scaled"] as const).find((m) => m === body["timeMode"]) ?? "virtual",
            ...(body["timeMode"] === "scaled" ? { speed: Number(body["speed"] ?? 60) } : {}),
            disclosure: (["full", "attributed", "outcome"] as const).find((d) => d === body["disclosure"]) ?? "attributed",
            logLevel: body["logLevel"] === "verbatim" ? "verbatim" : "trace",
          };
          session = new Session(config, opts.ports, opts.repoRoot, opts.runDir);
          return json(res, 201, snapshot(audience));
        }
        if (!session) return json(res, 409, { error: "create a session first" });

        if (req.method === "POST" && path === "/api/solutions") {
          const solution = body["reference"]
            ? session.addSolution({ reference: String(body["reference"]) })
            : session.addSolution({ baseUrl: String(body["baseUrl"] ?? "") });
          return json(res, 201, { id: solution.id, token: solution.token, baseUrl: solution.baseUrl, controlUrl: session.controlUrl });
        }
        const removal = /^\/api\/solutions\/(\w+)$/.exec(path);
        if (req.method === "DELETE" && removal) {
          await session.removeSolution(removal[1]!);
          return json(res, 200, snapshot(audience));
        }
        if (req.method === "POST" && path === "/api/probe") return json(res, 200, await session.probe());
        if (req.method === "POST" && path === "/api/start") {
          session.start();
          return json(res, 202, snapshot(audience));
        }
        if (req.method === "POST" && (path === "/api/pause" || path === "/api/resume" || path === "/api/stop")) {
          session.request({ action: path.slice(5) as "pause" | "resume" | "stop" });
          return json(res, 202, snapshot(audience));
        }
        if (req.method === "POST" && path === "/api/speed") {
          const timeMode = (["virtual", "realtime", "scaled"] as const).find((m) => m === body["timeMode"]);
          if (!timeMode) return json(res, 400, { error: "timeMode must be virtual, realtime or scaled" });
          session.request({ action: "retime", timeMode, ...(timeMode === "scaled" ? { speed: Number(body["speed"]) } : {}) });
          return json(res, 202, snapshot(audience));
        }
        if (req.method === "POST" && path === "/api/viewer") {
          if (!session.runPath) return json(res, 409, { error: "the run has not ended" });
          const port = opts.viewerPort ?? 8765;
          viewer?.kill();
          viewer = spawn(
            process.execPath,
            ["--disable-warning=ExperimentalWarning", join(opts.repoRoot, "src", "viewer", "scripts", "view.ts"), session.runPath, session.config.worldPath, "--port", String(port)],
            { cwd: opts.repoRoot, stdio: ["ignore", "pipe", "inherit"] },
          );
          const ready = await new Promise<boolean>((done) => {
            const t = setTimeout(() => done(false), 60_000);
            viewer!.stdout?.on("data", (d: Buffer) => {
              if (d.toString().includes("http://")) {
                clearTimeout(t);
                done(true);
              }
            });
            viewer!.on("exit", () => done(false));
          });
          return ready ? json(res, 200, { url: `http://127.0.0.1:${port}/` }) : json(res, 500, { error: "the viewer did not start" });
        }
        return json(res, 404, { error: "not found" });
      } catch (err) {
        return json(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
    })().catch((err: unknown) => json(res, 500, { error: String(err) }));
  });

  return new Promise((resolveServer, reject) => {
    server.on("error", reject);
    server.listen(opts.port, "127.0.0.1", () =>
      resolveServer({
        server,
        adminToken,
        url: `http://127.0.0.1:${opts.port}/?token=${adminToken}`,
        session: () => session,
        close: async () => {
          session?.dispose();
          viewer?.kill();
          server.closeAllConnections();
          await new Promise<void>((r) => server.close(() => r()));
        },
      }),
    );
  });
}
