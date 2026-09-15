// A simulation session: one world, one solution, one run, driven from outside.
//
// Specification: ROADMAP.md P2M8; PLAYER-CONTRACT.md §3, §4; TIME-MODEL.md §3.
//
// **One session at a time, and one solution in it** (decided 2026-09-15). A
// session is configured, a solution is registered and handed a run token, and
// Start runs the contract's lifecycle through `runOpenLoop`: the operator and
// control APIs come up, the clock stands still while the player gets ready
// within the preparation budget, and the day runs. Pause, resume, speed and
// stop go through `RunControl`, which lands each at a boundary and writes it
// down. Several solutions in one closed loop are P2M9.

import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { basename, join } from "node:path";

import { loadWorld } from "@tns/core";
import type { RunRecord, World } from "@tns/schema";
import { RunControl, openRunFile, runOpenLoop, type ControlRequest, type RunFile } from "@tns/server";
import type { Disclosure } from "@tns/viewer";
import { LiveRun } from "./live.ts";

export type TimeMode = "virtual" | "realtime" | "scaled";
/**
 * `configured` → a solution is registered → `preparation` (APIs up, the clock
 * frozen, waiting for the player to report ready) → `ready` (checked, waiting for
 * Start) → `running` ⇄ `paused` → `ended`, or `failed` if it never got going.
 */
export type SessionState = "configured" | "preparation" | "ready" | "running" | "paused" | "ended" | "failed";

/** Preparation was cancelled by removing the solution. */
class Cancelled extends Error {}

export interface SessionConfig {
  readonly worldPath: string;
  readonly loop: "open" | "closed";
  readonly appUserFraction?: number;
  readonly timeMode: TimeMode;
  readonly speed?: number;
  readonly disclosure: Disclosure;
  readonly logLevel: "trace" | "verbatim";
}

export interface Solution {
  readonly id: string;
  readonly baseUrl: string;
  readonly token: string;
  /** `reference` solutions are started and stopped by the session. */
  readonly kind: "external" | "reference";
  readonly mode?: string;
  readonly addedAt: number;
}

export interface SessionPorts {
  /** The control API's port; operators take the ports after it. */
  readonly api: number;
  /** Where a reference player started by the session listens. */
  readonly referencePlayer: number;
}

export class Session {
  readonly id = randomBytes(6).toString("hex");
  readonly config: SessionConfig;
  readonly world: World;
  live = new LiveRun();
  readonly control = new RunControl();
  readonly ports: SessionPorts;
  readonly repoRoot: string;
  #state: SessionState = "configured";
  #solution: Solution | null = null;
  #child: ChildProcess | null = null;
  #clock: { tau(): number; mode(): TimeMode; speed(): number } | null = null;
  #runFile: RunFile | null = null;
  #error: string | null = null;
  #runPath: string | null = null;
  #runDir: string;
  #gate: { resolve: () => void; reject: (e: Error) => void } | null = null;
  #identity: { capabilities: readonly string[]; contractVersions: readonly string[] } | null = null;
  #done: Promise<void> | null = null;
  #listeners = new Set<() => void>();

  constructor(config: SessionConfig, ports: SessionPorts, repoRoot: string, runDir: string) {
    this.#runDir = runDir;
    if (!existsSync(config.worldPath)) throw new Error(`no world bundle at ${config.worldPath}`);
    if (config.loop === "open" && config.appUserFraction !== undefined) {
      throw new Error("an app-user fraction applies only to a closed loop (REFERENCE-POLICY.md §3)");
    }
    if (config.timeMode === "scaled" && !(config.speed && config.speed > 0)) {
      throw new Error("a scaled session needs a positive speed");
    }
    this.config = config;
    this.world = loadWorld(config.worldPath);
    this.ports = ports;
    this.repoRoot = repoRoot;
  }

  get state(): SessionState {
    return this.#state;
  }
  get solution(): Solution | null {
    return this.#solution;
  }
  get error(): string | null {
    return this.#error;
  }
  get runPath(): string | null {
    return this.#runPath;
  }
  /** What the registered solution declared, once preparation checked it. */
  get identity() {
    return this.#identity;
  }
  /** Settles when the session's run is over, however it ended. */
  get done(): Promise<void> {
    return this.#done ?? Promise.resolve();
  }
  get controlUrl(): string {
    return `http://127.0.0.1:${this.ports.api}`;
  }

  /** τ now, and how fast it moves; before the run, where the day begins. */
  clock(): { tau: number; mode: TimeMode; speed: number } {
    if (this.#clock) return { tau: this.#clock.tau(), mode: this.#clock.mode(), speed: this.#clock.speed() };
    const first = Math.min(...this.world.queries.map((q) => q.departAfterS)) - 1800;
    return { tau: first, mode: this.config.timeMode, speed: this.config.speed ?? 1 };
  }

  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  #changed(): void {
    for (const l of this.#listeners) l();
  }

  /** One solution per session (P2M9 is several). A reference player is started here. */
  addSolution(spec: { baseUrl: string } | { reference: string }): Solution {
    if (this.#state !== "configured") throw new Error("solutions are registered before the session starts");
    if (this.#solution) {
      throw new Error(
        this.config.loop === "open"
          ? "an open-loop session takes one solution: scoring rests on one player against a fixed day"
          : "several solutions in one closed-loop session arrive at P2M9",
      );
    }
    const token = randomBytes(18).toString("base64url");
    if ("reference" in spec) {
      const mode = spec.reference;
      const port = this.ports.referencePlayer;
      this.#child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", join(this.repoRoot, "src", "refplayer", "scripts", "serve.ts")], {
        cwd: this.repoRoot,
        stdio: ["ignore", "ignore", "pipe"],
        env: {
          ...process.env,
          TNS_PLAYER_PORT: String(port),
          TNS_CONTROL_URL: this.controlUrl,
          TNS_PLAYER_MODE: mode,
          TNS_TOKEN: token,
        },
      });
      this.#child.stderr?.on("data", (d: Buffer) => process.stderr.write(`[reference ${mode}] ${d}`));
      this.#solution = { id: randomBytes(4).toString("hex"), baseUrl: `http://127.0.0.1:${port}`, token, kind: "reference", mode, addedAt: Date.now() };
    } else {
      const url = new URL(spec.baseUrl);
      if (url.protocol !== "http:") throw new Error("a solution's base URL is http:// on this machine");
      this.#solution = { id: randomBytes(4).toString("hex"), baseUrl: url.toString().replace(/\/$/, ""), token, kind: "external", addedAt: Date.now() };
    }
    this.#done = this.#launch();
    this.#changed();
    return this.#solution;
  }

  /** Before Start only: preparation is cancelled, the APIs come down, and the session is configured again. */
  async removeSolution(id: string): Promise<void> {
    if (this.#state !== "preparation" && this.#state !== "ready") {
      throw new Error("a solution can be removed only before the run starts");
    }
    if (this.#solution?.id !== id) throw new Error("no such solution");
    this.#gate?.reject(new Cancelled("the solution was removed before the run started"));
    await this.#done;
  }

  /** Probe the registered solution's health and identity, as the simulator will. */
  async probe(): Promise<{ ready: boolean; identity: unknown; detail: string }> {
    const s = this.#solution;
    if (!s) return { ready: false, identity: null, detail: "no solution registered" };
    const headers = { authorization: `Bearer ${s.token}`, "X-TNS-Contract": "0.3" };
    try {
      const health = await fetch(`${s.baseUrl}/v1/health`, { headers, signal: AbortSignal.timeout(2000) });
      const body = (await health.json().catch(() => ({}))) as { status?: string };
      const identity = await fetch(`${s.baseUrl}/v1/identity`, { headers, signal: AbortSignal.timeout(2000) })
        .then((r) => r.json())
        .catch(() => null);
      return {
        ready: health.ok && body.status === "ready",
        identity,
        detail: health.ok ? `health: ${body.status ?? "no status"}` : `health answered ${health.status}`,
      };
    } catch (err) {
      return { ready: false, identity: null, detail: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Bring the APIs up and prepare: wait for the player to report ready, check
   * its contract version, and hold before `run-start` until Start. The run file
   * is opened now, so a run that fails to get going still leaves its evidence.
   */
  async #launch(): Promise<void> {
    const s = this.#solution!;
    this.#state = "preparation";
    const name = `${this.world.manifest.seed}-${s.kind === "reference" ? s.mode : "own"}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    this.#runFile = openRunFile(this.#runDir, name, this.config.logLevel);
    const runFile = this.#runFile;
    const gate = new Promise<void>((resolve, reject) => (this.#gate = { resolve, reject }));
    try {
      const log = await runOpenLoop({
        world: this.world,
        playerBaseUrl: s.baseUrl,
        operatorPort: this.ports.api + 1,
        controlPort: this.ports.api,
        token: s.token,
        timeMode: this.config.timeMode,
        ...(this.config.speed !== undefined && this.config.timeMode === "scaled" ? { speed: this.config.speed } : {}),
        ...(this.config.loop === "closed"
          ? { loop: "closed" as const, appUserFraction: this.config.appUserFraction ?? 1 }
          : {}),
        disclosure: this.config.disclosure,
        logLevel: this.config.logLevel,
        control: this.control,
        expose: (clock) => (this.#clock = clock),
        observe: {
          traveller: (ref, m) => this.live.move(ref, m),
          reference: () => {},
        },
        stream: {
          record: (r: RunRecord, body?: string) => {
            runFile.stream.record(r, body);
            this.live.record(r);
          },
        },
        onReady: (identity) => {
          this.#identity = identity;
          this.#state = "ready";
          this.#changed();
        },
        awaitStart: () => gate,
        onState: (state) => {
          if (state !== "preparation") this.#state = state;
          this.#changed();
        },
      });
      runFile.finish(log);
      this.#runPath = runFile.path;
      this.#state = "ended";
    } catch (err) {
      runFile.abandon();
      if (err instanceof Cancelled) {
        // Nothing ran: the session is as it was before the solution came.
        rmSync(join(this.#runDir, `${name}.partial.ndjson`), { force: true });
        this.#solution = null;
        this.#identity = null;
        this.#clock = null;
        this.live = new LiveRun();
        this.#state = "configured";
      } else {
        this.#error = err instanceof Error ? err.message : String(err);
        this.#state = "failed";
      }
    } finally {
      this.#gate = null;
      this.#child?.kill();
      this.#child = null;
      this.#changed();
    }
  }

  /** Start the day: the player is ready and checked. */
  start(): void {
    if (this.#state !== "ready" || !this.#gate) {
      throw new Error(
        this.#state === "preparation"
          ? "the solution has not reported ready yet"
          : `the session is ${this.#state}, not ready to start`,
      );
    }
    this.#gate.resolve();
  }

  request(r: ControlRequest): void {
    if (this.#state !== "running" && this.#state !== "paused") {
      throw new Error(`a ${this.#state} session cannot be ${r.action === "retime" ? "re-sped" : `${r.action}d`}`);
    }
    this.control.request(r);
    this.#changed();
  }

  dispose(): void {
    this.#gate?.reject(new Cancelled("the session was replaced"));
    if (this.#state === "running" || this.#state === "paused") this.control.request({ action: "stop" });
    this.#child?.kill();
    this.#child = null;
  }

  summary() {
    return {
      id: this.id,
      state: this.#state,
      error: this.#error,
      world: {
        file: basename(this.config.worldPath),
        tier: this.world.manifest.tier,
        seed: this.world.manifest.seed,
        operators: this.world.manifest.operators.map((o) => ({ id: o.id, name: o.name })),
        travellers: this.world.queries.length,
      },
      config: this.config,
      controlUrl: this.controlUrl,
      runPath: this.#runPath,
      identity: this.#identity,
      queuedOperatorCalls: this.control.queued,
    };
  }
}
