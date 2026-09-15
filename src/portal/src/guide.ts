// The guide: what a player reads before writing a line.
//
// Specification: PLAYER-CONTRACT.md §2–§9, TIME-MODEL.md §2–§4, SCORING.md §2–§5.
//
// **Prose, so it can drift; so it is held.** Every number here is passed in from
// the code that enforces it, never typed twice, and `portal.test.ts` checks that
// the guide links every endpoint the two contract documents publish and lists
// every item the simulator does not yet honour. What it says about behaviour is
// written against the harness as it is, not the contract as it was planned —
// where those differ, the difference is on the last page.

import { NOT_YET_HONOURED } from "@tns/schema";

export interface GuideNumbers {
  /** Seconds before departure a plan is issued. */
  readonly planLeadS: number;
  /** Simulated seconds a plan or replan may take. */
  readonly deadlineS: number;
  /** Wall seconds before an unanswered request is abandoned. */
  readonly guardWallS: number;
  /** How many times a broken plan may be remade. */
  readonly maxReplans: number;
  readonly minTickIntervalS: number;
  /** Generalised seconds a traveller who never arrives is charged. */
  readonly nonArrivalS: number;
  readonly waitWeight: number;
  /** Wall seconds a player has to report \`ready\`. */
  readonly preparationS: number;
  /** Consecutive unanswered obligations before the run carries on without the player. */
  readonly abortAfterFailures: number;
}

export interface GuidePage {
  readonly slug: string;
  readonly title: string;
  readonly markdown: string;
}

export function guidePages(n: GuideNumbers): GuidePage[] {
  const minutes = (s: number) => `${s / 60} minutes`;
  return [
    {
      slug: "",
      title: "Start here",
      markdown: `
Three transport operators run one city, and each publishes its own API. They do not agree — about what a stop is, where it is, what time a timestamp means, or whether a bus is still coming. **Your solution unifies them**, and travellers rely on it to get across the city.

## What you are building

A web service at one base URL. It has three relationships with the world:

* **The simulator calls you.** It asks you to plan journeys for travellers about to set out, to replan when a plan breaks in front of one, and to tick — to go and read the operators now. See the [Player API](/contract/player).
* **You call the operators.** Each has a timetable, a realtime feed, and documentation of its own format. Where they are is in the brief. See [the operators](/operators).
* **You call the simulator.** For the brief, the simulated clock, and to warn a traveller that something on their journey has gone wrong. See the [Control API](/contract/control).

## What you are judged on

Mostly on **how quickly your travellers get where they are going**, compared with travellers who have no integration at all, and with the best route anyone could have known about. Then on **whether you warned them in time**. A traveller you decline to route still travels — the way anyone in a city without your service would — and you are charged for it. [How you are scored](/guide/scoring).

## Where to go next

* [A run, step by step](/guide/run) — what arrives, in what order, and how time works.
* [Answering plans and replans](/guide/answering) — what an itinerary is, and what makes one wrong.
* [Reading the operators](/guide/operators) — what their documentation promises, and what it does not.
* [Running your solution](/guide/running) — pointing the simulator at it.
* [Not yet honoured](/guide/gaps) — what the contract specifies and the simulator does not do yet.
`,
    },
    {
      slug: "run",
      title: "A run, step by step",
      markdown: `
## Before the run

Your service is given two things: where the control API is, and a **run token**. Every request the simulator sends you carries \`Authorization: Bearer <run token>\` and \`X-TNS-Contract: 0.3\`; send both on every call you make to the control API, which refuses a call without them. Refuse a request that does not carry the token: it is not from this run.

1. **Preparation.** The operators and the control API are up and the simulated clock stands still. The simulator polls \`GET /v1/health\` until you answer \`{"status": "ready"}\` — read the brief and ingest what you need first. You have ${Math.round(n.preparationS / 60)} minutes.
2. It reads \`GET /v1/identity\` once: your name, the contract versions you speak, the **capabilities** you implement, and — if you claim \`tick\` — how often you want ticks. **If you do not speak this contract's version, the run does not start.**
3. It sends \`POST /v1/run-start\`, with a digest of the brief. Responses to lifecycle notices are ignored.

Fetch \`GET /v1/brief\` from the control API whenever you like. It says where each operator is and the rules of the world: how far a traveller will walk, and how fast.

## During the run

* **Ticks**, if you claim \`tick\`, at the interval you declared and never more often than every ${n.minTickIntervalS} simulated seconds. Read the operators inside the handler. Answer with \`next_interval_sim_s\` to move the next one.
* **Plans**, ${minutes(n.planLeadS)} before each traveller departs, if you claim \`plan\`. You have ${n.deadlineS} simulated seconds.
* **Replans**, if you claim \`replan\`, when a plan you gave breaks in front of a traveller — the vehicle does not come, a connection is missed, or they cannot reach the next stop. Also ${n.deadlineS} simulated seconds.

**What you do not claim, you are not asked** — and the traveller acts without you, counted as forgone. **After ${n.abortAfterFailures} unanswered obligations in a row** — errors or timeouts — the simulator stops asking, and the rest of the day runs without you, scored as \`player_failure\`.

**At an instant holding both, the tick comes first**, so you answer with the freshest data you could have had.

## Time

The simulated clock is **not** the wall clock. In the default \`virtual\` mode it jumps from one event to the next, and **it stops while you are answering**: every operator call you make inside a handler is served as of that handler's instant. A whole day can pass in seconds of wall time, which is why the simulator sends ticks rather than expecting you to poll on a timer.

An answer takes effect **at its deadline**, in simulated time, however fast it came. In wall time you have ${n.guardWallS} seconds before the request is abandoned and counted as unanswered — and in \`virtual\` a request that takes that long makes the whole run \`invalid\`, because the machine decided it, not your solution. Faster answers are not scored better.

In \`realtime\` and \`scaled\` modes the clock keeps running while you think, and a late answer is a missed one. Scores from those modes are not comparable with \`virtual\`.

## The snapshot rule

**Every operator response is a pure function of simulated time.** Two calls at the same instant return the same bytes, however many times you ask; polling faster than a feed changes costs you API calls and tells you nothing new. Each operator's feed runs some amount behind the world — how far is not published, and working it out is part of the job.

## Pauses

Someone driving the simulation can pause it. A pause lands between obligations, never while you are answering one. While paused, your calls to the operators wait and are answered after it — or refused with \`503\` if too many are waiting — and \`GET /v1/clock\` says \`paused\`.

## After the run

\`POST /v1/run-end\`, with why it ended — \`completed\`, \`aborted\`, \`player_failure\` or \`invalid\` — and the run is scored, unless it was aborted or invalid.
`,
    },
    {
      slug: "answering",
      title: "Answering plans and replans",
      markdown: `
## A plan

Each request gives a traveller, an origin and a destination **as coordinates**, and when they want to leave. Finding stops near a point — across operators that disagree about where their stops are — is yours to do.

Answer with one result per request: \`ok\` with an itinerary, \`no_route\` if you believe there is none, or \`declined\`.

## An itinerary

A list of legs. A **transit leg** names the operator, the route, the trip, and the stop to board at and the stop to leave at — **in that operator's own identifiers**, exactly as it publishes them. The simulator never tells you its own names for anything, and it will not accept them.

* **The simulator walks your itinerary against what actually happens that day.** A cancelled vehicle does not come, a late one leaves late, and a connection that has become impossible is missed.
* **Walks are charged whether you mention them or not**: from the origin to your first stop, between stops where you change, and from your last stop to the destination. A traveller will not walk further than the brief's \`max_walk_m\` at either end, and walks at \`walk_speed_mps\`.
* **Times on a leg are unread.** A journey is charged from the trips and stops you name. Put times there if they help you; nothing checks them.
* **Wrong about the world is worse than silent.** A trip that does not exist, a stop the trip does not call at, a boarding point too far from the origin: the traveller does not get there.

## When a plan breaks

A replan request says what the traveller **perceived** — \`vehicle_cancelled\`, \`missed_connection\` or \`stranded\` — where they are standing, in the operator's own identifiers, and the part of your plan they have not travelled. Not their destination: you were told it when you planned, and are expected to have kept it.

* \`ok\` with a new itinerary, which is walked from where they stand.
* \`abandon\` — advise them to give up. Charged exactly as failing to get them there would be.
* \`continue\`, \`no_route\`, \`declined\`, an error or no answer: they carry on as anyone without your service would, from where they stand.

A plan may be remade ${n.maxReplans} times. After that the traveller gives up.

## Answers the simulator cannot read

A response that does not match the [Player API](/contract/player) schema is recorded as \`player_error\`, and the traveller carries on without you — as for no answer at all.
`,
    },
    {
      slug: "operators",
      title: "Reading the operators",
      markdown: `
Each operator documents its own API: its [pages](/operators) here, and the same content as OpenAPI JSON at its \`docs_url\` during a run.

## What an operator's documentation promises

**Format and units.** Whether a stop is a whole station or a single boarding point. How its identifiers look. Whether a position is a station's centre or a platform's. How it writes a time. What unit a delay is in. What words its status field uses.

## What it does not

**Accuracy, freshness and completeness.** No operator documents that its survey is out, that its feed lags, or that it leaves things out — it either does not know, or would not say. Those you find by reading the data, comparing one operator with another, and checking what happens against what was published.

**Nothing about any other operator.** How three feeds relate is the whole of the problem, and none of them knows the answer.

## Two things to keep in mind

* The same place may have different names, different identifiers and a slightly different position at each operator, and two different places may share a name.
* Operators serve the world as they see it, **as of the moment you ask** in simulated time. A feed describes the instant it says it describes, which may not be now.
`,
    },
    {
      slug: "notify",
      title: "Warning travellers",
      markdown: `
\`POST /v1/notify\` on the control API, with the traveller's reference and a message. The simulator stamps it **when it arrives**, in simulated time; any time you state yourself is ignored.

* **In time** means before the traveller's last chance to do something about it — before they board the leg that will fail them.
* **Silent** — something happened to a traveller and you never said.
* **Noisy** — you warned a traveller nothing happened to. Warning everyone about everything is not a strategy.

Warnings are the Information part of your score. See [How you are scored](/guide/scoring).
`,
    },
    {
      slug: "scoring",
      title: "How you are scored",
      markdown: `
## Service — getting travellers there

For every traveller, the time door to door, with **waiting counted ${n.waitWeight} times over** — people mind standing on a platform more than riding. A traveller who never arrives counts as ${minutes(n.nonArrivalS)}.

**Capture** places your travellers between two others, on the same day:

* **No integration** — travellers who plan on the published timetables, change only where an interchange is declared, find out about trouble by standing at the stop, and replan from there. Capture 0.
* **The best route knowable when you planned** — with every operator understood perfectly and everything announced by then. Capture 1.

Above 1 is possible; negative means your travellers did worse than with no integration. **A plan answered without an itinerary — \`declined\`, \`no_route\`, an error or no answer — is charged a penalty on top of its traveller's outcome**, so declining is never free.

## Information — warning travellers

Recall and precision of your warnings, scaled by how much notice the useful ones gave. See [Warning travellers](/guide/notify).

## Cost

Every operator call counts. Within the budget it costs nothing; past it, it does.

## When scores compare

Only runs in \`virtual\` time and open loop compare with each other. A closed-loop run, or one in \`realtime\` or \`scaled\` time, is scored the same way and marked not comparable.
`,
    },
    {
      slug: "running",
      title: "Running your solution",
      markdown: `
## From the dashboard

\`\`\`
npm run sim
\`\`\`

prints a link to a dashboard. Create a session — a world, open or closed loop, how fast time runs, what you may see afterwards — then register your service's base URL. The dashboard gives you its **run token** and the control API's address: start your service with both, the way the reference players read them, as \`TNS_CONTROL_URL\` and \`TNS_TOKEN\`. When it reports ready, press Start, and watch its obligations, its traffic and its warnings as the day runs. Pause it, change its speed, or stop it; each is written into the run.

A solution's own token opens a view of just its session, without the controls: the dashboard links it.

## From the command line

Choose a token, start your service with it, then:

\`\`\`
TNS_PLAYER_URL=http://127.0.0.1:8080 TNS_TOKEN=<the same token> TNS_CONTROL_PORT=7430 npm run demo
\`\`\`

The demo starts the operators and the control API on port 7430, calls your service at \`TNS_PLAYER_URL\` through a whole day on the committed world, prints the scorecard, and writes the run to \`runs/\`. Then:

\`\`\`
npm run view -- runs/<the run>.ndjson worlds/m1.world.db
\`\`\`

explains it traveller by traveller.

* \`TNS_TIME_MODE=scaled TNS_SPEED=60\` keeps the world alive for about a quarter of an hour rather than a few seconds, so you can call the operators by hand while it runs.
* \`TNS_LOOP=closed\` asks your replans when travellers reach the break rather than all at once.
* Without \`TNS_PLAYER_URL\` the demo runs a reference player instead — \`TNS_PLAYER_MODE=naive\`, \`competent\`, \`blind\` or \`null\`.
`,
    },
    {
      slug: "gaps",
      title: "Not yet honoured",
      markdown: `
The player contract specifies these, and the simulator does not do them yet. **Do not rely on them.** Each will move into the reference pages when it is built.

${NOT_YET_HONOURED.map((g) => `* ${g.what} (${g.spec})`).join("\n")}
`,
    },
  ];
}
