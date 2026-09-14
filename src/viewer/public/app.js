// The run viewer's page. Draws what the server's model says and decides nothing:
// every number comes from /api, which reads it from the run log or recomputes
// it by the scorer's own rule (src/viewer/src/timeline.ts).

const $ = (id) => document.getElementById(id);
const api = async (path) => {
  const res = await fetch(path);
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error(body.error ?? res.statusText), { status: res.status });
  return body;
};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const clock = (s) => {
  if (s === null || s === undefined) return "—";
  const day = Math.floor(s / 86400);
  const h = String(Math.floor((s % 86400) / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${day > 0 ? `d${day} ` : ""}${h}:${m}:${sec}`;
};
const mins = (s) => (s === null || s === undefined ? "—" : `${(s / 60).toFixed(1)} min`);
const sign = (x) => (x > 0.0005 ? "pos" : x < -0.0005 ? "neg" : "");
const fixed = (x, n = 3) => (x === null || x === undefined ? "n/a" : Number(x).toFixed(n));
const SVG = "http://www.w3.org/2000/svg";
const el = (name, attrs = {}, parent) => {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
};

// ---- tooltip --------------------------------------------------------------
const tip = $("tip");
function withTip(node, text) {
  node.addEventListener("mousemove", (e) => {
    tip.textContent = text;
    tip.hidden = false;
    tip.style.left = `${Math.min(e.clientX + 12, window.innerWidth - 370)}px`;
    tip.style.top = `${e.clientY + 14}px`;
  });
  node.addEventListener("mouseleave", () => (tip.hidden = true));
}

// ---- tabs -----------------------------------------------------------------
function showTab(name) {
  for (const b of document.querySelectorAll(".tabs button")) b.setAttribute("aria-selected", String(b.dataset.tab === name));
  for (const s of document.querySelectorAll(".tab")) s.hidden = s.id !== `tab-${name}`;
  if (name === "map") openMap();
  const hash = name === "traveller" && state.ref ? `#traveller/${state.ref}` : `#${name}`;
  if (location.hash !== hash) history.replaceState(null, "", hash);
}
for (const b of document.querySelectorAll(".tabs button")) b.addEventListener("click", () => showTab(b.dataset.tab));

const state = { run: null, ref: null, filter: "all", calls: null };

// ---- overview -------------------------------------------------------------
function renderOverview(run) {
  const h = run.header;
  const c = run.card;
  $("run-title").textContent = `Run ${h.runId}`;
  $("run-meta").textContent = `seed ${h.worldSeed} · world ${h.worldContentHash.slice(0, 12)} · tier ${run.world.tier} · ${run.world.quays} quays · ${run.world.operators.length} operators`;
  const badges = [
    `<span class="badge">${esc(h.loop === "closed" ? `closed loop · ${Math.round((h.appUserFraction ?? 1) * 100)} % app users` : "open loop")}</span>`,
    `<span class="badge">${esc(h.timeMode)}${h.speed ? ` ${h.speed}×` : ""}</span>`,
    `<span class="badge">disclosure: ${esc(run.disclosure)}${run.disclosure !== run.recordedDisclosure ? ` (recorded ${esc(run.recordedDisclosure)})` : ""}</span>`,
    `<span class="badge ${c.verdict === "scored" ? "" : "bad"}">${c.verdict === "scored" ? "valid" : esc(c.verdict)}</span>`,
    c.comparable ? "" : `<span class="badge warn" title="${esc(c.notComparableBecause)}">not comparable</span>`,
  ];
  $("run-badges").innerHTML = badges.join("");

  const s = c.service;
  const tiles = [
    ["Capture", fixed(s.capture), s.forgonePenalty > 0 ? `incl. −${fixed(s.forgonePenalty)} forgone penalty` : "against P0a"],
    ["Information", fixed(c.information.score), `recall ${fixed(c.information.recall, 2)} · timeliness ${fixed(c.information.timeliness, 2)}`],
    [`Headline (${c.profile})`, fixed(c.headline), c.verdictReason ?? ""],
    ["Arrived", `${s.arrived}/${s.travellers}`, s.outsideApp ? `${s.outsideApp} outside the app, not scored` : `${s.forgone} forgone`],
    ["Mean journey", mins(s.meanJourneyS), `P1 ${mins(s.meanReferenceS)} · P0 ${mins(s.meanOracleS)}`],
    ["API calls", String(c.cost.apiCalls), `${(c.cost.bytes / 1048576).toFixed(1)} MB · ${c.cost.notifications} warnings`],
  ];
  $("tiles").innerHTML = tiles
    .map(([label, value, sub]) => `<div class="tile"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="sub">${esc(sub)}</div></div>`)
    .join("");

  const maxLost = Math.max(1e-9, ...c.attribution.map((a) => a.captureLost));
  $("buckets").innerHTML =
    `<div class="bars">` +
    c.attribution
      .map(
        (a) =>
          `<div class="row"><div>${esc(a.cause)} <span class="muted">· ${a.travellers}</span><div class="track"><div class="fill" style="width:${(100 * a.captureLost) / maxLost}%"></div></div></div><div class="num">${a.captureLost.toFixed(2)}</div></div>`,
      )
      .join("") +
    `</div>`;

  const at = run.attribution;
  if (!at) {
    $("sections").innerHTML =
      run.disclosure === "outcome"
        ? ""
        : `<p class="muted small" style="margin-top:12px">By catalogue section: not computed. <code>npm run attribute</code> re-runs the player with each conflict switched on alone (<code>SCORING.md</code> §10, stage two); pass its file with <code>--attribution</code>.</p>`;
  } else {
    const rows = at.sections
      .map((x) => `<tr><td>${esc(x.section)}</td><td class="num">${x.conflicts}</td><td class="num ${sign(x.captureLost)}">${x.captureLost.toFixed(3)}</td></tr>`)
      .join("");
    const detail = at.conflicts
      ? `<table style="margin-top:8px"><thead><tr><th>conflict</th><th class="num">capture</th><th class="num">lost</th></tr></thead><tbody>${at.conflicts
          .map((e) => `<tr><td class="mono">${esc(e.conflict)}</td><td class="num">${e.capture.toFixed(3)}</td><td class="num ${sign(e.captureLost)}">${e.captureLost.toFixed(3)}</td></tr>`)
          .join("")}</tbody></table>`
      : `<p class="muted small">Which operator and which setting is shown at <code>full</code> only: that is the answer key (<code>OBSERVABILITY.md</code> §8).</p>`;
    $("sections").innerHTML = `<h2 style="margin-top:14px">By catalogue section — ${esc(at.player)}</h2>
      <p class="muted small">Capture with every conflict off ${at.captureClean.toFixed(3)}, as declared ${at.captureDeclared.toFixed(3)}. Each conflict switched on alone, on the run's one seed; rows over-sum where conflicts overlap. A negative row is a conflict this player did better with, which is worth checking before believing.</p>
      <table><thead><tr><th>section</th><th class="num">conflicts</th><th class="num">capture lost</th></tr></thead><tbody>${rows}</tbody></table>${detail}`;
  }

  const i = c.information;
  $("information").innerHTML = `<table><tbody>
    <tr><td>Material events</td><td class="num">${i.materialEvents}</td></tr>
    <tr><td>Warned in time</td><td class="num">${i.inTime}</td></tr>
    <tr><td>Warned too late</td><td class="num">${i.late}</td></tr>
    <tr><td>Never warned</td><td class="num">${i.silent}</td></tr>
    <tr><td>Warnings to travellers nothing happened to</td><td class="num">${i.noisy}</td></tr>
    </tbody></table>
    <p class="muted small" style="margin-top:8px">Open a traveller to see, for each event, when it was knowable, when the player read that feed, and when it warned.</p>`;

  const filters = [
    ["all", "All"],
    ["lost", "Lost > 1 min"],
    ["failed", "Did not arrive"],
    ["replanned", "Replanned"],
    ["forgone", "Forgone"],
    ["unwarned", "Not warned in time"],
  ];
  $("filters").innerHTML = filters.map(([k, label]) => `<button class="chip" data-f="${k}" aria-pressed="${state.filter === k}">${label}</button>`).join("");
  for (const b of $("filters").querySelectorAll("button")) {
    b.addEventListener("click", () => {
      state.filter = b.dataset.f;
      renderOverview(run);
    });
  }

  const keep = {
    all: () => true,
    lost: (t) => (t.lossS ?? 0) > 60,
    failed: (t) => !t.arrived,
    replanned: (t) => t.replans > 0,
    forgone: (t) => t.forgone,
    unwarned: (t) => t.bands.some((v) => v !== "in_time"),
  }[state.filter];
  const rows = run.travellers
    .filter(keep)
    .slice()
    .sort((a, b) => (b.lossS ?? -Infinity) - (a.lossS ?? -Infinity));
  $("travellers").innerHTML =
    `<thead><tr><th>traveller</th><th>departs</th><th>outcome</th><th class="num">journey</th><th class="num">vs P0a</th><th class="num">replans</th><th>warnings</th></tr></thead><tbody>` +
    rows
      .map((t) => {
        const outcome = !t.appUser ? "outside the app" : t.arrived ? (t.forgone ? "arrived (fell back)" : "arrived") : `did not arrive · ${t.failureReason ?? ""}`;
        const loss = t.lossS === null ? "—" : `<span class="${t.lossS > 30 ? "pos" : t.lossS < -30 ? "neg" : ""}">${t.lossS > 0 ? "+" : ""}${mins(t.lossS)}</span>`;
        const warnings = t.bands.map((v) => (v === "in_time" ? "✓" : v === "late" ? "late" : "silent")).join(" ");
        return `<tr data-ref="${esc(t.travellerRef)}"><td class="mono">${esc(t.travellerRef)}</td><td>${clock(t.departAfterS)}</td><td>${esc(outcome)}</td><td class="num">${mins(t.journeyS)}</td><td class="num">${loss}</td><td class="num">${t.replans || ""}</td><td>${warnings}</td></tr>`;
      })
      .join("") +
    `</tbody>`;
  for (const tr of $("travellers").querySelectorAll("tbody tr")) tr.addEventListener("click", () => openTraveller(tr.dataset.ref));
}

// ---- traveller timeline ---------------------------------------------------
const STEP_COLOUR = { walk: "var(--walk)", wait: "var(--wait)", ride: "var(--ride)" };

async function openTraveller(ref) {
  state.ref = ref;
  const select = $("traveller-select");
  if (select.value !== ref) select.value = ref;
  showTab("traveller");
  const t = await api(`/api/traveller/${encodeURIComponent(ref)}`);
  if (state.ref !== ref) return;
  renderTraveller(t);
}

function renderTraveller(t) {
  const o = t.outcome;
  const facts = [
    ["departs", clock(t.departAfterS)],
    ["outcome", o.appUser === false ? "outside the app" : o.arrived ? `arrived in ${mins(o.journeyS)}` : "did not arrive"],
    ["waited", mins(o.waitS)],
    ["generalised", mins(t.effectiveS)],
    ["P1", mins(t.referenceS)],
    ["P0a", mins(t.announcedS)],
    ["P0", mins(t.oracleS)],
  ];
  $("traveller-facts").innerHTML = facts.map(([k, v]) => `<span>${k} <b>${esc(v)}</b></span>`).join("");
  drawTimeline(t);

  $("explanation").innerHTML = t.explanation.map((line) => `<li>${esc(line).replace(/`([^`]+)`/g, "<code>$1</code>")}</li>`).join("");

  $("obligations").innerHTML =
    `<thead><tr><th>obligation</th><th>issued</th><th>outcome</th><th>legs answered</th><th class="num">calls</th></tr></thead><tbody>` +
    t.obligations
      .map(
        (s) =>
          `<tr data-cause="${esc(s.requestId)}"><td class="mono">${esc(s.requestId)}${s.trigger ? ` <span class="muted">${esc(s.trigger)}</span>` : ""}</td><td>${clock(s.issuedAt)}</td><td>${esc(s.outcome)}</td><td class="mono">${esc(s.legs.join(" · ") || "—")}</td><td class="num">${s.calls.length}</td></tr>`,
      )
      .join("") +
    `</tbody>`;
  for (const tr of $("obligations").querySelectorAll("tbody tr")) {
    tr.addEventListener("click", () => {
      $("api-cause").value = tr.dataset.cause;
      showTab("api");
      renderCalls();
    });
  }
}

function drawTimeline(t) {
  const svg = $("timeline");
  svg.replaceChildren();

  const spans = [...t.steps, ...(t.references ? [...t.references.P1, ...t.references.P0a] : [])];
  const marks = [
    t.departAfterS,
    ...t.obligations.flatMap((s) => [s.issuedAt, s.deadline]),
    ...spans.flatMap((s) => [s.fromS, s.toS]),
    ...t.knowledge.flatMap((b) => [b.knowableAtS, b.fetchedAtS, b.warnedAtS, b.lastDecisionPointS]),
    ...t.notifications.map((n) => n.tau),
  ].filter((x) => x !== null && x !== undefined);
  const lo = Math.min(...marks) - 120;
  const hi = Math.max(...marks) + 180;

  const rows = [["Player", "player"], ["Traveller", "traveller"]];
  if (t.references) rows.push(["P1", "P1"], ["P0a", "P0a"]);
  t.knowledge.forEach((b, i) => rows.push([`Knew · ${b.operator}`, `band${i}`]));

  const labelW = 110;
  const rowH = 30;
  const width = Math.max(760, (svg.parentElement?.clientWidth ?? 900) - 4);
  const plotW = width - labelW - 16;
  const height = 34 + rows.length * rowH + 8;
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const x = (s) => labelW + ((s - lo) / (hi - lo)) * plotW;
  const y = (i) => 34 + i * rowH;

  // Axis: a tick every 5, 10, 15, 30 or 60 minutes, whichever gives about eight.
  const axis = el("g", { class: "axis" }, svg);
  const stepS = [300, 600, 900, 1800, 3600, 7200].find((s) => (hi - lo) / s <= 9) ?? 14400;
  for (let s = Math.ceil(lo / stepS) * stepS; s <= hi; s += stepS) {
    el("line", { x1: x(s), x2: x(s), y1: 22, y2: height - 6, class: "grid" }, axis);
    el("text", { x: x(s), y: 16, "text-anchor": "middle" }, axis).textContent = clock(s).slice(-8, -3);
  }
  rows.forEach(([label], i) => {
    el("text", { x: 4, y: y(i) + 19, class: "rowlabel" }, svg).textContent = label;
  });

  // A reference row is drawn thin rather than faded: faded amber reads as a band colour.
  const bar = (row, from, to, colour, text, thin = false) => {
    const w = Math.max(2, x(to) - x(from));
    const r = el("rect", { x: x(from), y: y(row) + (thin ? 12 : 8), width: w, height: thin ? 6 : 14, rx: 2, fill: colour }, svg);
    withTip(r, text);
    return r;
  };
  const glyph = (row, at, symbol, colour, text) => {
    const g = el("text", { x: x(at), y: y(row) + 20, "text-anchor": "middle", fill: colour, style: `fill:${colour};font-size:14px;font-weight:700` }, svg);
    g.textContent = symbol;
    withTip(g, text);
  };

  // Obligations: a plan or replan, from issue to deadline, with its answer.
  for (const s of t.obligations) {
    bar(0, s.issuedAt, s.deadline, "var(--plan)", `${s.requestId} · ${s.obligation}${s.trigger ? ` (${s.trigger})` : ""} · ${s.outcome} · issued ${clock(s.issuedAt)} · ${s.calls.length} calls`);
    if (s.outcome !== "ok") glyph(0, s.deadline, "✕", "var(--break)", `${s.requestId} answered ${s.outcome}`);
  }
  for (const n of t.notifications) glyph(0, n.tau, "✉", "var(--arrive)", `warned at ${clock(n.tau)}: ${n.message}`);

  const drawSteps = (row, steps, thin) => {
    for (const s of steps) {
      const where = s.fromQuay ? ` · ${s.fromQuay}${s.toQuay && s.toQuay !== s.fromQuay ? ` → ${s.toQuay}` : ""}` : "";
      if (s.kind === "ride") {
        const late = s.delayS > 0;
        bar(row, s.fromS, s.toS, late ? "var(--ride-late)" : "var(--ride)", `ride ${clock(s.fromS)}–${clock(s.toS)}${late ? ` · ${Math.round(s.delayS / 60)} min late` : ""}${s.journeyId ? ` · ${s.journeyId}` : ""}${where}`, thin);
      } else if (s.kind === "walk" || s.kind === "wait") {
        if (s.toS > s.fromS) bar(row, s.fromS, s.toS, STEP_COLOUR[s.kind], `${s.kind} ${mins(s.toS - s.fromS)}${where}`, thin);
      } else if (s.kind === "break") {
        glyph(row, s.fromS, "▲", "var(--break)", `plan broke at ${clock(s.fromS)}: ${s.reason}${where}`);
      } else if (s.kind === "arrive") {
        glyph(row, s.fromS, "●", "var(--arrive)", `arrived ${clock(s.fromS)}`);
      } else if (s.kind === "give_up") {
        glyph(row, s.fromS, "✕", "var(--break)", `gave up at ${clock(s.fromS)}: ${s.reason}`);
      }
    }
  };
  drawSteps(1, t.steps, false);
  if (t.references) {
    drawSteps(2, t.references.P1, true);
    drawSteps(3, t.references.P0a, true);
  }

  // The knowledge band: the gap between the world changing and the player knowing, shaded.
  t.knowledge.forEach((b, i) => {
    const row = (t.references ? 4 : 2) + i;
    const end = b.lastDecisionPointS;
    const warnedAt = b.warnedAtS !== null && b.warnedAtS <= end ? b.warnedAtS : end;
    if (b.knowableAtS !== null && b.announcedAtS !== null && b.knowableAtS > b.announcedAtS) {
      bar(row, Math.max(lo, b.announcedAtS), b.knowableAtS, "var(--band-world)", `announced ${clock(b.announcedAtS)}; not yet in any feed until ${clock(b.knowableAtS)} (staleness)`);
    }
    if (b.knowableAtS !== null) {
      const readAt = b.fetchedAtS !== null ? Math.min(b.fetchedAtS, end) : end;
      if (readAt > b.knowableAtS) bar(row, Math.max(lo, b.knowableAtS), readAt, "var(--band-unread)", `knowable from ${clock(b.knowableAtS)}; the player had not read ${b.operator}'s feed`);
    }
    if (b.fetchedAtS !== null && b.fetchedInTime && warnedAt > b.fetchedAtS) {
      bar(row, b.fetchedAtS, warnedAt, "var(--band-unwarned)", `in hand from ${clock(b.fetchedAtS)} — read, not necessarily understood — and not yet warned`);
    }
    if (b.verdict === "in_time") bar(row, warnedAt, Math.max(warnedAt + 1, end), "var(--band-warned)", `warned at ${clock(b.warnedAtS)}, before the decision point`);
    if (b.fetchedAtS !== null) glyph(row, b.fetchedAtS, "⬇", "var(--accent)", `read ${b.operator}'s feed at ${clock(b.fetchedAtS)}`);
    if (b.warnedAtS !== null) glyph(row, b.warnedAtS, "✉", b.verdict === "in_time" ? "var(--arrive)" : "var(--break)", `warned at ${clock(b.warnedAtS)} (${b.verdict.replace("_", " ")})`);
    el("line", { x1: x(end), x2: x(end), y1: y(row) + 4, y2: y(row) + 26, stroke: "var(--ink)", "stroke-width": 2 }, svg);
    withTip(
      el("rect", { x: x(end) - 4, y: y(row) + 4, width: 8, height: 22, fill: "transparent" }, svg),
      `last decision point ${clock(end)}, as the scorer records it${b.disruption ? ` · ${b.disruption}` : ""}` +
        (b.knowableAtS !== null && b.knowableAtS > end ? " — before anything was knowable (KNOWN-ISSUES.md #71)" : ""),
    );
  });

  const legend = [
    ["plan / replan, issue to deadline", "var(--plan)"],
    ["walk", "var(--walk)"],
    ["wait", "var(--wait)"],
    ["ride", "var(--ride)"],
    ["late ride", "var(--ride-late)"],
  ];
  if (t.knowledge.length) {
    if (t.knowledge.some((b) => b.knowableAtS !== null)) {
      legend.push(["announced, not yet knowable", "var(--band-world)"], ["knowable, feed not read", "var(--band-unread)"]);
    }
    legend.push(["read, not yet warned", "var(--band-unwarned)"], ["warned in time", "var(--band-warned)"]);
  }
  $("legend").innerHTML =
    legend.map(([label, c]) => `<span style="--c:${c}">${label}</span>`).join("") +
    `<span class="muted">▲ plan broke · ● arrived · ✕ gave up / unanswered · ✉ warning · ⬇ feed read · ▍ decision point</span>`;
}

// ---- API requests ---------------------------------------------------------
async function renderCalls() {
  state.calls ??= await api("/api/calls");
  const cause = $("api-cause").value.trim();
  const op = $("api-operator").value;
  const rows = state.calls.filter((c) => (!cause || c.cause === cause) && (!op || c.operator === op));
  $("api-count").textContent = `${rows.length} of ${state.calls.length} calls`;
  const shown = rows.slice(0, 1500);
  $("calls").innerHTML =
    `<thead><tr><th>τ</th><th>operator</th><th>endpoint</th><th class="num">status</th><th class="num">bytes</th><th>while answering</th></tr></thead><tbody>` +
    shown
      .map((c) => `<tr data-i="${c.i}"><td>${clock(c.tau)}</td><td>${esc(c.operator)}</td><td class="mono">${esc(c.endpoint)}</td><td class="num">${c.status}</td><td class="num">${c.bytes.toLocaleString()}</td><td class="mono">${esc(c.cause ?? "—")}</td></tr>`)
      .join("") +
    `</tbody>`;
  for (const tr of $("calls").querySelectorAll("tbody tr")) {
    tr.addEventListener("click", async () => {
      for (const x of $("calls").querySelectorAll("tr.selected")) x.classList.remove("selected");
      tr.classList.add("selected");
      const call = state.calls[Number(tr.dataset.i)];
      $("body-title").textContent = `${call.operator} ${call.endpoint} at ${clock(call.tau)}`;
      $("body").textContent = "regenerating…";
      const r = await api(`/api/body/${call.i}`);
      if (!r.ok) {
        $("body").textContent = r.reason;
        return;
      }
      let text = r.body;
      try {
        text = JSON.stringify(JSON.parse(r.body), null, 2);
      } catch {
        // Not JSON: show it as served.
      }
      const cap = 400_000;
      $("body").textContent = `// ${r.source}, ${r.body.length.toLocaleString()} bytes\n` + (text.length > cap ? `${text.slice(0, cap)}\n… ${(text.length - cap).toLocaleString()} more characters` : text);
    });
  }
}
$("api-cause").addEventListener("input", () => renderCalls());
$("api-operator").addEventListener("change", () => renderCalls());

// ---- map replay -----------------------------------------------------------
const map = { data: null, refused: false, tau: 0, playing: false, frame: 0, last: 0 };

async function openMap() {
  if (map.data || map.refused) return;
  try {
    map.data = await api("/api/map");
  } catch (err) {
    map.refused = true;
    $("map-refused").hidden = false;
    $("map-refused").innerHTML = `<p>${esc(err.message)}</p>`;
    return;
  }
  const d = map.data;
  $("map-ui").hidden = false;
  const starts = d.journeys.map((j) => j[1]);
  const lo = Math.min(...starts);
  const hi = Math.max(...d.journeys.map((j) => j[1] + j[2] + (d.patterns[j[0]]?.stops.at(-1)?.[1] ?? 0)));
  const slider = $("map-slider");
  slider.min = String(lo);
  slider.max = String(hi);
  const firstTraveller = Math.min(...Object.values(d.travellers).flatMap((steps) => steps.map((s) => s.fromS)));
  map.tau = Number.isFinite(firstTraveller) ? firstTraveller : lo;
  slider.value = String(map.tau);
  slider.addEventListener("input", () => {
    map.tau = Number(slider.value);
    drawMap();
  });
  const follow = $("map-follow");
  for (const ref of Object.keys(d.travellers)) follow.insertAdjacentHTML("beforeend", `<option>${esc(ref)}</option>`);
  if (state.ref) follow.value = state.ref;
  follow.addEventListener("change", drawMap);
  $("map-play").addEventListener("click", () => {
    map.playing = !map.playing;
    $("map-play").textContent = map.playing ? "Pause" : "Play";
    map.last = performance.now();
    if (map.playing) requestAnimationFrame(tick);
  });

  // Project once: equirectangular about the network's centre, which at city scale is exact enough to read.
  const lats = d.quays.map((q) => q.lat);
  const lons = d.quays.map((q) => q.lon);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const minX = Math.min(...lons) * kx;
  const maxX = Math.max(...lons) * kx;
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);
  const W = 1000;
  const pad = 30;
  const scale = (W - 2 * pad) / Math.max(maxX - minX, maxY - minY);
  const H = Math.round((maxY - minY) * scale + 2 * pad);
  map.W = W;
  map.H = H;
  map.xy = d.quays.map((q) => [pad + (q.lon * kx - minX) * scale, H - pad - (q.lat - minY) * scale]);
  map.quayIndex = new Map(d.quays.map((q, i) => [q.id, i]));
  const operators = [...new Set(d.patterns.map((p) => p.operator))].sort();
  const palette = ["#2f6fd0", "#c2410c", "#17803d", "#8b3fd1", "#b8860b", "#0e7490"];
  map.colour = new Map(operators.map((o, i) => [o, palette[i % palette.length]]));
  drawMap();
}

function tick(now) {
  if (!map.playing) return;
  const speed = Number($("map-speed").value);
  map.tau = Math.min(Number($("map-slider").max), map.tau + ((now - map.last) / 1000) * speed);
  map.last = now;
  $("map-slider").value = String(Math.round(map.tau));
  drawMap();
  requestAnimationFrame(tick);
}

function drawMap() {
  const d = map.data;
  const svg = $("map");
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${map.W} ${map.H}`);
  const tau = map.tau;
  $("map-clock").textContent = clock(Math.round(tau));

  for (const p of d.patterns) {
    const pts = p.stops.filter((s) => s[0] >= 0).map((s) => map.xy[s[0]].join(",")).join(" ");
    el("polyline", { points: pts, fill: "none", stroke: map.colour.get(p.operator), "stroke-opacity": 0.25, "stroke-width": 3 }, svg);
  }
  for (const [i, [qx, qy]] of map.xy.entries()) {
    withTip(el("circle", { cx: qx, cy: qy, r: 2.5, fill: "var(--muted)" }, svg), `${d.quays[i].name} · ${d.quays[i].id}`);
  }

  // Vehicles, where the day actually had them: delayed by their delay, cancelled ones not running.
  d.journeys.forEach(([pi, start, delay, cancelled], ji) => {
    if (cancelled) return;
    const p = d.patterns[pi];
    if (!p) return;
    const t0 = start + delay;
    const stops = p.stops;
    if (tau < t0 + stops[0][2] || tau > t0 + stops.at(-1)[1]) return;
    for (let k = 0; k < stops.length - 1; k++) {
      const dep = t0 + stops[k][2];
      const arr = t0 + stops[k + 1][1];
      if (tau < t0 + stops[k][1] || tau > arr) continue;
      const a = map.xy[stops[k][0]];
      const b = map.xy[stops[k + 1][0]];
      const f = tau <= dep ? 0 : (tau - dep) / Math.max(1, arr - dep);
      const dot = el("circle", { cx: a[0] + (b[0] - a[0]) * f, cy: a[1] + (b[1] - a[1]) * f, r: 4.5, fill: map.colour.get(p.operator), stroke: delay > 0 ? "var(--break)" : "none", "stroke-width": 2 }, svg);
      withTip(dot, `${p.operator} ${p.line} · ${d.journeyIds[ji]}${delay > 0 ? ` · ${Math.round(delay / 60)} min late` : ""}`);
      break;
    }
  });

  // Travellers, from their regenerated steps.
  const follow = $("map-follow").value;
  for (const [ref, steps] of Object.entries(d.travellers)) {
    const pos = travellerAt(steps, tau);
    if (!pos) continue;
    const mine = ref === follow;
    const c = el("rect", { x: pos[0] - (mine ? 6 : 3), y: pos[1] - (mine ? 6 : 3), width: mine ? 12 : 6, height: mine ? 12 : 6, fill: mine ? "var(--ink)" : "var(--wait)", stroke: "var(--panel)", "stroke-width": 1 }, svg);
    withTip(c, `${ref}`);
  }
}

function travellerAt(steps, tau) {
  if (!steps.length || tau < steps[0].fromS || tau > steps.at(-1).toS) return null;
  const at = (id) => (id ? map.xy[map.quayIndex.get(id)] : null);
  for (const s of steps) {
    if (tau < s.fromS || tau > s.toS) continue;
    const a = at(s.fromQuay);
    const b = at(s.toQuay);
    if (a && b) {
      const f = s.toS > s.fromS ? (tau - s.fromS) / (s.toS - s.fromS) : 0;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    return a ?? b;
  }
  return null;
}

// ---- boot -----------------------------------------------------------------
const run = await api("/api/run");
state.run = run;
renderOverview(run);
const select = $("traveller-select");
select.innerHTML = run.travellers.map((t) => `<option>${esc(t.travellerRef)}</option>`).join("");
select.addEventListener("change", () => openTraveller(select.value));
const step = (delta) => {
  const refs = run.travellers.map((t) => t.travellerRef);
  const i = Math.max(0, refs.indexOf(state.ref ?? refs[0]));
  openTraveller(refs[(i + delta + refs.length) % refs.length]);
};
$("prev").addEventListener("click", () => step(-1));
$("next").addEventListener("click", () => step(1));
for (const o of run.world.operators) $("api-operator").insertAdjacentHTML("beforeend", `<option value="${esc(o.id)}">${esc(o.name)}</option>`);

const [tab, ref] = location.hash.slice(1).split("/");
if (tab === "traveller" && ref) openTraveller(decodeURIComponent(ref));
else if (["overview", "api", "map"].includes(tab)) {
  showTab(tab);
  if (tab === "api") renderCalls();
} else showTab("overview");
document.querySelector('[data-tab="api"]').addEventListener("click", () => renderCalls());
