// The live dashboard. Draws the server's snapshot and sends what the buttons
// ask for; it decides nothing. The server filters every snapshot to what this
// audience may see (src/sim/src/server.ts).

const $ = (id) => document.getElementById(id);
const role = document.body.dataset.role;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const clock = (s) => {
  if (s === null || s === undefined) return "—";
  const day = Math.floor(s / 86400);
  const hms = [Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");
  return `${day > 0 ? `d${day} ` : ""}${hms}`;
};
const mins = (s) => (s === null || s === undefined ? "—" : `${(s / 60).toFixed(1)} min`);

async function call(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    notice(data.error ?? res.statusText);
    throw new Error(data.error ?? res.statusText);
  }
  notice(null);
  return data;
}
function notice(text) {
  $("notice").hidden = !text;
  $("notice").textContent = text ?? "";
}

let worldsFilled = false;
let last = null;

function render(s) {
  last = s;
  $("role").textContent = role === "admin" ? "administrator" : "your solution";
  const state = s.clock?.state ?? "no session";
  $("state").textContent = state;
  $("state").className = `badge ${state}`;

  if (role === "admin" && !worldsFilled && s.worlds?.length) {
    $("world-select").innerHTML = s.worlds.map((w) => `<option${w === "worlds/m1.world.db" ? " selected" : ""}>${esc(w)}</option>`).join("");
    worldsFilled = true;
  }

  if (!s.session) {
    $("sim-time").textContent = "—";
    $("pace").textContent = "";
    $("session-summary").textContent = "No session yet.";
    $("solution").innerHTML = `<p class="muted small">Create a session, then register a solution.</p>`;
    setButtons(null);
    return;
  }

  const c = s.clock;
  $("sim-time").textContent = clock(c.tau);
  $("pace").textContent = c.mode === "virtual" ? "virtual" : `${c.mode} ${c.speed}×`;

  const cfg = s.session.config;
  $("session-summary").innerHTML =
    `${esc(s.session.world.file ?? "")} · tier ${s.session.world.tier} · ${s.session.world.travellers} travellers · ` +
    `${cfg.loop} loop${cfg.loop === "closed" ? ` (${Math.round((cfg.appUserFraction ?? 1) * 100)} %)` : ""} · disclosure ${esc(cfg.disclosure)}` +
    (s.session.error ? `<br><span class="bad">${esc(s.session.error)}</span>` : "");

  const sol = s.solution;
  if (sol) {
    const playerLink = `${location.origin}/player?token=${encodeURIComponent(sol.token)}`;
    $("solution").innerHTML = `<dl class="kv">
      <dt>Calls</dt><dd class="mono">${esc(sol.baseUrl)}${sol.kind === "reference" ? ` <span class="muted">(reference ${esc(sol.mode)})</span>` : ""}</dd>
      <dt>Control API</dt><dd class="mono">${esc(s.session.controlUrl)}</dd>
      <dt>Run token</dt><dd class="mono token">${esc(sol.token)}</dd>
      ${role === "admin" ? `<dt>Its view</dt><dd><a href="${esc(playerLink)}" target="_blank" rel="noopener">open the player dashboard</a></dd>` : ""}
    </dl>
    <p class="small muted">Start your solution with <code>TNS_CONTROL_URL=${esc(s.session.controlUrl)}</code> and <code>TNS_TOKEN=&lt;the run token&gt;</code>. It sends the token as <code>Authorization: Bearer</code> and <code>X-TNS-Contract: 0.3</code> on every control API call.</p>
    <p class="small">${
      state === "preparation"
        ? `<span class="muted">Preparing: the APIs are up and the clock is frozen, waiting for the solution to report <code>ready</code> (up to 5 minutes).</span>`
        : state === "ready"
          ? `<span class="ok">Ready</span> — contract ${esc((s.session.identity?.contractVersions ?? []).join(", "))}, claims ${esc((s.session.identity?.capabilities ?? []).join(", ") || "nothing")}. Press Start.`
          : ""
    }</p>
    ${role === "admin" && (state === "preparation" || state === "ready") ? `<div class="buttons"><button id="probe">Check its health</button><button id="remove" class="danger">Remove</button></div><div id="probe-result" class="small"></div>` : ""}`;
    const probe = $("probe");
    if (probe) probe.onclick = async () => {
      const r = await call("POST", "/api/probe");
      $("probe-result").innerHTML = `<span class="${r.ready ? "ok" : "bad"}">${r.ready ? "ready" : "not ready"}</span> — ${esc(r.detail)}`;
    };
    const remove = $("remove");
    if (remove) remove.onclick = () => call("DELETE", `/api/solutions/${sol.id}`).then(render);
  } else {
    $("solution").innerHTML = `<p class="muted small">No solution registered.</p>`;
  }
  $("solution-add").hidden = !!sol || state !== "configured";
  setButtons(state);

  const v = s.live;
  const o = v.obligations;
  const tiles = [
    ["Obligations", o.total, Object.entries(o.byKind).map(([k, n]) => `${k} ${n}`).join(" · ")],
    ["Answer time", o.latencyP50Ms === null ? "—" : `${o.latencyP50Ms} ms`, o.latencyP95Ms === null ? "" : `p95 ${o.latencyP95Ms} ms · lag up to ${o.maxLagS} s`],
    ["Unanswered", (o.byOutcome.player_error ?? 0) + (o.byOutcome.player_timeout ?? 0), `timeouts ${o.byOutcome.player_timeout ?? 0} · unclaimed ${o.byOutcome.unclaimed ?? 0}`],
    ["Travellers settled", v.travellersSettled, `${v.travellersArrived} arrived`],
    ["Warnings", v.warningsSent, ""],
    ["API calls", v.apiCalls, `budget ${v.callBudget}`],
    ["Capture so far", v.provisional?.capture === null || v.provisional?.capture === undefined ? "—" : v.provisional.capture.toFixed(3), v.provisional ? `provisional · ${v.provisional.scoredTravellers} travellers` : "provisional"],
  ];
  $("tiles").innerHTML = tiles.map(([l, val, sub]) => `<div class="tile"><div class="label">${esc(l)}</div><div class="value">${esc(val)}</div><div class="sub">${esc(sub)}</div></div>`).join("");

  $("obligation-counts").textContent = Object.entries(o.byOutcome).map(([k, n]) => `${k} ${n}`).join(" · ");
  $("obligations").innerHTML =
    `<thead><tr><th>request</th><th>issued</th><th>outcome</th><th class="num">ms</th><th class="num">lag</th></tr></thead><tbody>` +
    o.recent.map((r) => `<tr><td class="mono">${esc(r.requestId)}${r.trigger ? ` <span class="muted">${esc(r.trigger)}</span>` : ""}</td><td>${clock(r.issuedAt)}</td><td class="${r.outcome === "ok" ? "ok" : r.outcome.startsWith("player_") ? "bad" : ""}">${esc(r.outcome)}</td><td class="num">${r.latencyMs}</td><td class="num">${r.lagS ?? ""}</td></tr>`).join("") +
    `</tbody>`;
  $("operators").innerHTML =
    `<thead><tr><th>operator</th><th class="num">calls</th><th class="num">last sim hour</th><th class="num">MB</th><th class="num">errors</th></tr></thead><tbody>` +
    v.operators.map((t) => `<tr><td>${esc(t.operator)}</td><td class="num">${t.calls}</td><td class="num">${t.callsLastSimHour}</td><td class="num">${(t.bytes / 1048576).toFixed(1)}</td><td class="num ${t.errors ? "bad" : ""}">${t.errors}</td></tr>`).join("") +
    `</tbody>`;
  $("warnings").innerHTML =
    `<thead><tr><th>τ</th><th>traveller</th><th>message</th></tr></thead><tbody>` +
    v.warnings.map((w) => `<tr><td>${clock(w.tau)}</td><td class="mono">${esc(w.travellerRef)}</td><td>${esc(w.message)}</td></tr>`).join("") +
    `</tbody>`;
  $("travellers").innerHTML =
    `<thead><tr><th>traveller</th><th>outcome</th><th class="num">journey</th></tr></thead><tbody>` +
    v.recentSettled.map((t) => `<tr><td class="mono">${esc(t.travellerRef)}</td><td class="${t.arrived ? "ok" : "bad"}">${t.arrived ? (t.forgone ? "arrived, fell back" : "arrived") : esc(t.failureReason ?? "did not arrive")}</td><td class="num">${mins(t.journeyS)}</td></tr>`).join("") +
    `</tbody>`;

  const controls = v.controls.map((x) => `${clock(x.tau)} ${x.action}${x.timeMode ? ` → ${x.timeMode}${x.timeMode === "virtual" ? "" : ` ${x.speed}×`}` : ""}`);
  const ended = state === "ended" || state === "failed";
  $("run-end").innerHTML =
    (controls.length ? `<p class="small">Control log: ${esc(controls.join(" · "))}</p>` : "") +
    (v.runEnd ? `<p class="small bad">Run ended: ${esc(v.runEnd.reason)} — ${esc(v.runEnd.detail)}</p>` : "") +
    (ended && s.session.runPath ? `<p class="small">Run written to <code>${esc(s.session.runPath)}</code></p><button id="open-viewer">Open in viewer</button>` : "");
  const viewer = $("open-viewer");
  if (viewer) viewer.onclick = async () => {
    viewer.disabled = true;
    viewer.textContent = "Starting the viewer…";
    const r = await call("POST", "/api/viewer").catch(() => null);
    viewer.disabled = false;
    viewer.textContent = "Open in viewer";
    if (r?.url) window.open(r.url, "_blank", "noopener");
  };

  $("map-panel").hidden = !s.mapAvailable;
  if (s.mapAvailable) drawMap(c.tau);
}

function setButtons(state) {
  const running = state === "running";
  const paused = state === "paused";
  $("start").disabled = state !== "ready";
  $("pause").disabled = !running;
  $("resume").disabled = !paused;
  $("stop").disabled = !(running || paused);
  for (const el of $("speed-form").elements) el.disabled = !(running || paused);
  // The form describes a session to create, not the one running: showing its
  // defaults beside a live session read as that session's settings.
  const live = ["preparation", "ready", "running", "paused"].includes(state);
  $("session-form").hidden = live;
  const speedForm = $("speed-form");
  if ((running || paused) && document.activeElement?.form !== speedForm && last?.clock) {
    speedForm.timeMode.value = last.clock.mode;
    speedForm.speed.value = last.clock.speed;
  }
}

// ---- forms and buttons ----------------------------------------------------
if (role === "admin") {
  const form = $("session-form");
  const syncForm = () => {
    for (const el of document.querySelectorAll(".closed-only")) el.hidden = form.loop.value !== "closed";
    for (const el of document.querySelectorAll(".scaled-only")) el.hidden = form.timeMode.value !== "scaled";
  };
  form.addEventListener("change", syncForm);
  syncForm();
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    call("POST", "/api/session", f).then(render);
  });
  $("external-form").addEventListener("submit", (e) => {
    e.preventDefault();
    call("POST", "/api/solutions", { baseUrl: e.target.baseUrl.value });
  });
  $("reference-form").addEventListener("submit", (e) => {
    e.preventDefault();
    call("POST", "/api/solutions", { reference: e.target.reference.value });
  });
  $("start").onclick = () => call("POST", "/api/start");
  $("pause").onclick = () => call("POST", "/api/pause");
  $("resume").onclick = () => call("POST", "/api/resume");
  $("stop").onclick = () => {
    if (confirm("Stop the run? It is kept, and never scored.")) call("POST", "/api/stop");
  };
  $("speed-form").addEventListener("submit", (e) => {
    e.preventDefault();
    call("POST", "/api/speed", { timeMode: e.target.timeMode.value, speed: Number(e.target.speed.value) });
  });
}

// ---- the map ----------------------------------------------------------------
const map = { data: null, fetchedAt: 0, xy: null, quayIndex: null, colour: null, W: 1000, H: 700 };
const SVG = "http://www.w3.org/2000/svg";
const el = (name, attrs, parent) => {
  const n = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent.appendChild(n);
  return n;
};

async function drawMap(tau) {
  const now = Date.now();
  if (!map.data || now - map.fetchedAt > 3000) {
    map.fetchedAt = now;
    const res = await fetch("/api/map");
    if (!res.ok) return;
    map.data = await res.json();
    if (!map.xy) project();
  }
  const d = map.data;
  const svg = $("map");
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${map.W} ${map.H}`);
  $("map-note").textContent = "vehicles where the day has them · squares are travellers";
  for (const p of d.patterns) {
    el("polyline", { points: p.stops.filter((s) => s[0] >= 0).map((s) => map.xy[s[0]].join(",")).join(" "), fill: "none", stroke: map.colour.get(p.operator), "stroke-opacity": 0.3, "stroke-width": 3 }, svg);
  }
  d.journeys.forEach(([pi, start, delay, cancelled]) => {
    if (cancelled) return;
    const p = d.patterns[pi];
    if (!p) return;
    const t0 = start + delay;
    const st = p.stops;
    if (tau < t0 + st[0][2] || tau > t0 + st.at(-1)[1]) return;
    for (let k = 0; k < st.length - 1; k++) {
      const dep = t0 + st[k][2];
      const arr = t0 + st[k + 1][1];
      if (tau < t0 + st[k][1] || tau > arr) continue;
      const a = map.xy[st[k][0]];
      const b = map.xy[st[k + 1][0]];
      const f = tau <= dep ? 0 : (tau - dep) / Math.max(1, arr - dep);
      el("circle", { cx: a[0] + (b[0] - a[0]) * f, cy: a[1] + (b[1] - a[1]) * f, r: 4.5, fill: map.colour.get(p.operator), stroke: delay > 0 ? "var(--bad)" : "none", "stroke-width": 2 }, svg);
      break;
    }
  });
  for (const steps of Object.values(d.travellers)) {
    const pos = travellerAt(steps, tau);
    if (pos) el("rect", { x: pos[0] - 3, y: pos[1] - 3, width: 6, height: 6, fill: "var(--warn)" }, svg);
  }
}

function project() {
  const d = map.data;
  const lats = d.quays.map((q) => q.lat);
  const lons = d.quays.map((q) => q.lon);
  const kx = Math.cos((((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI) / 180);
  const minX = Math.min(...lons) * kx;
  const minY = Math.min(...lats);
  const span = Math.max(Math.max(...lons) * kx - minX, Math.max(...lats) - minY);
  const pad = 20;
  const scale = (map.W - 2 * pad) / span;
  map.H = Math.round((Math.max(...lats) - minY) * scale + 2 * pad);
  map.xy = d.quays.map((q) => [pad + (q.lon * kx - minX) * scale, map.H - pad - (q.lat - minY) * scale]);
  map.quayIndex = new Map(d.quays.map((q, i) => [q.id, i]));
  const palette = ["#2f6fd0", "#c2410c", "#17803d", "#8b3fd1", "#b8860b", "#0e7490"];
  map.colour = new Map([...new Set(d.patterns.map((p) => p.operator))].sort().map((o, i) => [o, palette[i % palette.length]]));
}

function travellerAt(steps, tau) {
  const s = steps.find((m) => {
    const from = m.fromS ?? m.atS;
    const to = m.toS ?? m.atS;
    return tau >= from && tau <= to;
  });
  if (!s) return null;
  const at = (id) => (id ? map.xy[map.quayIndex.get(id)] : null);
  const a = at(s.fromQuay ?? s.quay);
  const b = at(s.toQuay ?? s.quay);
  if (a && b && s.toS > s.fromS) {
    const f = (tau - s.fromS) / (s.toS - s.fromS);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }
  return a ?? b;
}

// ---- live ---------------------------------------------------------------------
const source = new EventSource("/api/events");
source.onmessage = (e) => render(JSON.parse(e.data));
source.onerror = () => notice("Lost the connection to the simulation server; retrying…");
