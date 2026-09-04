# Playtest kit

Everything needed to run the external playtest that `ROADMAP.md` P1M0 part A asks for, and the sheet to record it on.

This exists because Gate 1 has no external evidence and cannot get any from inside the project (`KNOWN-ISSUES.md` #3). The competent solution that established the world is *solvable* was written by someone who already knew every conflict in it. Whether the world is **discoverable** — whether a stranger can find those conflicts by looking — is a different question, and only a stranger can answer it.

**This is the *undirected* measurement, and Phase 3's generated quests will not replace it.** Quests ask *can you find X, having been told X exists*; this asks *can you work out that X exists at all*. The second is the harder claim and the one the project rests on. When quests arrive, a world passing all of them while no unprompted engineer notices a single conflict has failed at exactly the thing the quests appear to prove — so keep running this, less often, rather than retiring it.

**One session with one engineer closes more of this than another month of internal work.** Two is better. More than three is diminishing returns at this stage.

---

## 1. Who to ask

An engineer who has **not seen this repository**. Backend or data-integration experience is the target audience; a strong generalist is fine. What matters far more than seniority:

* they have consumed somebody else's API in anger at least once;
* they are willing to think aloud;
* they will not be polite about it afterwards.

**Do not use anyone who has heard you describe the project.** The single most valuable thing being measured is what someone concludes from the artefacts alone, and a two-minute pitch over coffee destroys that measurement permanently. There is no way to un-tell someone that the coordinates are offset.

---

## 2. What to hand over

The repository at a tagged commit, and nothing else:

```
git clone <repo> && cd transport-network-simulator
npm ci
npm run world:build
```

Point them at [`PLAYING.md`](PLAYING.md). That is the whole briefing.

**Do not hand over, mention, or leave open:**

| Withheld | Why |
|---|---|
| `CORECONCEPT.md` §2.1 | the conflict catalogue is the answer key |
| `docs/BUILD-LOG.md` | records which conflicts were planted and what they cost |
| `src/projections/src/defects.ts` | *is* the answer key, in executable form |
| `src/refplayer/src/competent*.ts` | a worked solution |
| `tools/worldbuild/city.py` | the manifests, in plain sight |
| `docs/KNOWN-ISSUES.md` | #5 gives away the most interesting single finding |

They can read anything else, including the specifications. Reading the specification is not cheating — it is the skill being taught (`CORECONCEPT.md` §2.1 F). Reading the *generator* is.

A practical way to enforce this without trusting anybody's willpower: give them a branch with those paths removed, built by `git rm` on a throwaway branch. The world bundle is committed, so the world still builds and every command in `PLAYING.md` still works.

---

## 3. What to say

Say this, and then as little as possible:

> Here is a repository. It simulates several transport companies that publish their timetables and live data independently, and they do not agree with each other. Build a service that answers journey queries well anyway. `PLAYING.md` tells you the interface. Think out loud where you can. I am not going to help, and that is not me being difficult — the thing I am measuring is what you can work out without me.

When they ask a question, write it down and say some version of *"what would you do if I weren't here?"* Every question you answer is a data point you have destroyed.

The two exceptions, where you should just help:

* **the tooling is broken** — an install failure, a port conflict, a Node version problem. That is a bug in the project and should be fixed rather than measured.
* **they are stuck badly enough to quit.** Note the timestamp, note exactly what unstuck them, then help. A playtest that ends in someone giving up in silence produces less information than one that ends in someone finishing annoyed.

---

## 4. What to record

The times matter more than the opinions. Opinions are recoverable afterwards; timings are not.

### Timeline

| Mark | What it means |
|---|---|
| **T0** | they start reading |
| **T_first_request** | first successful call to an operator API |
| **T_first_run** | first scored run of any kind, however bad |
| **T_first_conflict** | first time they *say out loud* that two operators disagree |
| **T_first_named** | first time they name a specific conflict correctly |
| **T_stop** | they stop, whether finished, bored or blocked |

`T_first_run` is the discoverability number the gate wants. If it is under an hour the on-ramp works. If it is over three, `PLAYING.md` is the problem, not the world.

### For each conflict they find

Which one, at what time, and **how**:

* from reading the data,
* from reading a specification,
* from a score that made no sense,
* by accident.

That last column is the one that decides P0M8. A conflict nobody finds is a conflict that costs points for reasons the player never understands, which is indistinguishable from an unfair world.

### Verbatim quotes

Especially at the moments of confusion. Write the words down rather than your summary of them — *"why is this station in two places"* and *"the geometry is wrong"* mean different things about what they understood.

### Afterwards, ask

1. What did you think the game was about, an hour in?
2. What was the most annoying part, and was it annoying in an interesting way or a stupid way?
3. Which of the operators' disagreements did you notice but decide to ignore? Why?
4. Did you trust the documentation? Did you check?
5. Would you keep going for another two hours? Say no if it is no.

Question 4 is the one this project most needs answered and has no other way to ask (`KNOWN-ISSUES.md` #12). Question 5 is the honest form of Gate 1.

---

## 5. What the result means

**The gate passes** if at least one engineer reached a scored run without help, found at least one conflict unaided, and could describe what the challenge was afterwards in terms recognisably matching what it is.

**The gate fails, informatively,** if they reached a scored run and then had no idea why their score was what it was. That is a diagnosis of the *feedback*, not the world: the scorecard is telling them a number without telling them what to do differently, and `OBSERVABILITY.md` §8 disclosure levels are the lever.

**The gate fails, badly,** if they could not get to a scored run at all, or if they got there and found nothing worth solving. Those two mean different things — the first is an on-ramp problem and cheap to fix; the second is the one that should genuinely stop the project, and `PHASES.md` says it is allowed to.

Record the outcome in [`BUILD-LOG.md`](BUILD-LOG.md) under P1M0, including the failures. A playtest whose negative results are quietly dropped is worth less than no playtest, because it leaves behind a number nobody can challenge.
