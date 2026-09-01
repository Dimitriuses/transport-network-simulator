// @tns/conformance
// A suite any candidate player can run against itself before a scored run.
//
// Specification: PLAYER-CONTRACT.md §14.
//
// This checks that a player *speaks the contract* — nothing about whether it is
// any good. A solution can pass every check here and score below zero, and that
// is the intended division: conformance is about the interface, scoring is
// about the work.
//
// It is deliberately runnable against any base URL, including one on another
// machine. The simulator never executes player code, so this cannot either.

export const PACKAGE_NAME = "@tns/conformance";

export interface Check {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
  /** A failing `required` check means a scored run will not work. */
  readonly required: boolean;
}

export interface ConformanceReport {
  readonly baseUrl: string;
  readonly checks: readonly Check[];
  readonly ready: boolean;
}

const CONTRACT_VERSION = "0.3";
const KNOWN_CAPABILITIES = new Set(["plan", "replan", "tick", "notify", "tracing"]);

async function json(url: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, init);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

export async function checkPlayer(baseUrl: string): Promise<ConformanceReport> {
  const checks: Check[] = [];
  const add = (name: string, passed: boolean, detail: string, required = true): void => {
    checks.push({ name, passed, detail, required });
  };

  // ---- reachable ---------------------------------------------------------
  // A player may still be binding its port. Poll, as the simulator does.
  let health: { status: number; body: unknown } | null = null;
  let lastError = "";
  for (let i = 0; i < 40 && health === null; i++) {
    try {
      health = await json(`${baseUrl}/v1/health`);
    } catch (err) {
      lastError = String(err);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (health === null) {
    add("reachable", false, `nothing answered at ${baseUrl} within 10s: ${lastError}`);
    return { baseUrl, checks, ready: false };
  }
  add("health responds", health.status === 200, `GET /v1/health returned ${health.status}`);

  let healthBody = health.body as { status?: string } | null;
  add(
    "health reports a known state",
    ["ready", "starting", "unavailable"].includes(healthBody?.status ?? ""),
    `status was ${JSON.stringify(healthBody?.status)}; expected ready | starting | unavailable`,
  );

  // Wait for readiness the way the simulator does, rather than testing a player
  // mid-boot and reporting four cascading failures for one cause.
  for (let i = 0; i < 40 && healthBody?.status !== "ready"; i++) {
    await new Promise((r) => setTimeout(r, 250));
    healthBody = (await json(`${baseUrl}/v1/health`)).body as { status?: string } | null;
  }
  add(
    "becomes ready",
    healthBody?.status === "ready",
    "still not ready after 10s — a player ingests from the operator APIs, so it " +
      "needs its simulator running before conformance means anything",
  );
  if (healthBody?.status !== "ready") return { baseUrl, checks, ready: false };

  // ---- identity ----------------------------------------------------------
  const identity = await json(`${baseUrl}/v1/identity`);
  add("identity responds", identity.status === 200, `GET /v1/identity returned ${identity.status}`);

  const id = identity.body as {
    name?: string;
    version?: string;
    contract_versions?: string[];
    capabilities?: string[];
    tick?: { interval_sim_s?: number };
  } | null;

  add("identity names the player", typeof id?.name === "string" && id.name.length > 0, `name=${JSON.stringify(id?.name)}`);
  add(
    "identity declares a contract version we speak",
    Array.isArray(id?.contract_versions) && id.contract_versions.includes(CONTRACT_VERSION),
    `declared ${JSON.stringify(id?.contract_versions)}; this simulator speaks ${CONTRACT_VERSION}`,
  );

  const caps = id?.capabilities ?? [];
  add(
    "capabilities are all recognised",
    Array.isArray(id?.capabilities) && caps.every((c) => KNOWN_CAPABILITIES.has(c)),
    `declared ${JSON.stringify(caps)}; known are ${[...KNOWN_CAPABILITIES].join(", ")}`,
  );
  add(
    "declares at least `plan`",
    caps.includes("plan"),
    "a player that cannot plan has nothing to be asked",
  );

  // A capability is a promise. Declaring `tick` without a cadence, or a cadence
  // without the capability, means the simulator cannot honour it.
  add(
    "tick cadence matches the tick capability",
    caps.includes("tick") === (typeof id?.tick?.interval_sim_s === "number"),
    caps.includes("tick")
      ? `declared tick but interval_sim_s is ${JSON.stringify(id?.tick?.interval_sim_s)}`
      : "declared an interval without the tick capability",
    false,
  );

  // ---- plan --------------------------------------------------------------
  const planReq = {
    contract_version: CONTRACT_VERSION,
    run_id: "conformance",
    issued_at: "2031-04-07T08:00:00+03:00",
    deadline: "2031-04-07T08:00:20+03:00",
    guard_wall_s: 30,
    requests: [
      {
        request_id: "conformance-1",
        traveller_ref: "conformance-trv-1",
        origin: { lat: 50.4501, lon: 30.4931 },
        destination: { lat: 50.4499, lon: 30.5349 },
        depart_after: "2031-04-07T08:15:00+03:00",
        arrive_by: null,
      },
    ],
  };

  const plan = await json(`${baseUrl}/v1/plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(planReq),
  });
  add("plan responds 200", plan.status === 200, `POST /v1/plan returned ${plan.status}`);

  const planBody = plan.body as {
    results?: { request_id?: string; status?: string; itinerary?: unknown }[];
  } | null;

  add(
    "plan echoes the request id",
    planBody?.results?.[0]?.request_id === "conformance-1",
    `got ${JSON.stringify(planBody?.results?.[0]?.request_id)}`,
  );
  add(
    "plan status is one of the declared values",
    ["ok", "no_route", "declined"].includes(planBody?.results?.[0]?.status ?? ""),
    `status was ${JSON.stringify(planBody?.results?.[0]?.status)}`,
  );

  // ---- batching ----------------------------------------------------------
  //
  // Batch size never changes the meaning of a request, and a player that only
  // handles the first entry looks fine until closed loop, where batches are the
  // normal case (PLAYER-CONTRACT.md §11).
  const batch = await json(`${baseUrl}/v1/plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...planReq,
      requests: [
        planReq.requests[0]!,
        { ...planReq.requests[0]!, request_id: "conformance-2", traveller_ref: "conformance-trv-2" },
      ],
    }),
  });
  const batchBody = batch.body as { results?: unknown[] } | null;
  add(
    "plan answers every request in a batch",
    (batchBody?.results?.length ?? 0) === 2,
    `sent 2 requests, got ${batchBody?.results?.length ?? 0} results`,
  );

  // ---- lifecycle ---------------------------------------------------------
  for (const path of ["/v1/run-start", "/v1/run-end"]) {
    const res = await json(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ run_id: "conformance", reason: "completed" }),
    });
    add(`${path} accepts a notification`, res.status < 500, `returned ${res.status}`, false);
  }

  // ---- tick --------------------------------------------------------------
  if (caps.includes("tick")) {
    const tick = await json(`${baseUrl}/v1/tick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contract_version: CONTRACT_VERSION,
        run_id: "conformance",
        sim_time: "2031-04-07T08:00:00+03:00",
        guard_wall_s: 30,
      }),
    });
    add("tick responds 200", tick.status === 200, `POST /v1/tick returned ${tick.status}`);
  }

  const ready = checks.every((c) => c.passed || !c.required);
  return { baseUrl, checks, ready };
}

export function renderConformance(report: ConformanceReport): string {
  const lines = ["", `  CONFORMANCE — ${report.baseUrl}`, ""];
  for (const c of report.checks) {
    const mark = c.passed ? "ok  " : c.required ? "FAIL" : "warn";
    lines.push(`  ${mark}  ${c.name.padEnd(42)} ${c.passed ? "" : c.detail}`);
  }
  lines.push("");
  lines.push(
    report.ready
      ? "  Ready for a scored run. This says nothing about how well it will do."
      : "  Not ready: a required check failed, and a scored run would not work.",
  );
  lines.push("");
  return lines.join("\n");
}
