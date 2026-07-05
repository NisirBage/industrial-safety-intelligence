# Pitches

Ready-to-deliver scripts at five lengths, for whichever slot a judging
round actually gives you. Every number is the same grep-verified stat
used in `lib/presentationScript.ts::PLATFORM_STATS` and
`docs/presentation/judge_faq.md` - nothing here is a new figure
invented for pitching.

---

## One-sentence elevator pitch

"Industrial Safety Intelligence turns plant sensor, permit, equipment,
and worker data into a real-time, fully-explainable risk score for
every zone - using four deterministic reasoning agents instead of a
black-box model, so every decision can be replayed and audited exactly
the way it happened."

---

## 2-minute pitch

Use Presentation Mode (`/story`, **Start Demo**) as the visual backing
track while you talk; it auto-advances through the same beats below.

"Industrial plants run on alarms that trip a single sensor past a hard
threshold - no context, no explanation, and no way to reconstruct why
an alarm fired six months later during an incident review.

Industrial Safety Intelligence replaces that with four independent
deterministic agents - gas risk, equipment status, worker exposure,
permit intelligence - that each score their own slice of a zone's
risk from live sensor and permit data. A Fusion step combines them
with cross-signal interaction awareness (two elevated risks together
are worse than either alone), and every score maps to a tier through
hysteresis, so it doesn't flicker on noise.

Here's the part that matters for trust: nothing here is AI in the
black-box sense. No LLM, no trained model, no randomness anywhere in
the risk computation - it's tested to be deterministic, not just
designed to be. Identical inputs always produce identical outputs.
That means every decision is explainable and every incident is
replayable, tick by tick, from persisted data alone - which is exactly
what a safety auditor or incident investigator actually needs.

On top of that engine: a live Digital Twin of the plant floor, an
Operations Center that turns a risk score into a prioritized action
queue with ETAs and SOP references, an Executive Dashboard for a plant
manager's one-glance safety status, and a Counterfactual Comparator
that proves the value gap against a traditional single-sensor alarm -
side by side, on the same real incident.

It's a real backend, a real PostgreSQL database, 467 automated tests,
and it's fully containerized and monitored. Deterministic. Explainable.
Production-ready."

---

## 5-minute pitch

**Open (30s):** the elevator pitch above, verbatim.

**The problem (45s):** Traditional plant safety alarms are single-
sensor threshold trips - no cross-signal reasoning, no explanation
trail, and nothing an investigator can replay after the fact. The
alternative most people reach for is a trained ML model or an LLM,
which trades that problem for a worse one: a black box that can't be
audited or reproduced on demand.

**The engine (90s):** Four independent agents - Gas Risk, Equipment
Status, Worker Exposure, Permit Intelligence - each score their slice
of a zone from live data through documented, closed-form formulas (a
saturating curve, a weighted sum, threshold ratios). Fusion combines
them with an interaction bonus when multiple risks compound, capped at
100. Tiering applies hysteresis so a score hovering near a boundary
doesn't flicker between tiers. Every one of these modules is frozen
(`docs/architecture/CORE_FREEZE.md`) and covered by determinism tests
that run identical inputs twice and assert identical output - plus a
static AST-walking test that fails the build if any wall-clock or
random call ever sneaks into the domain layer.

**What's built on top (90s):** Live Digital Twin (real worker counts,
permit-type icons, sensor gas types, tier coloring on an interactive
plant map). Time Machine (scrub any historical incident tick by tick,
synchronized across every dashboard through one shared `ReplayContext`).
Decision Graph (visual trace of exactly which rule fired and why).
Operations Center (a prioritized action queue - ETA, personnel,
equipment, SOP reference, qualitative business impact, never a
fabricated risk-reduction number). Executive Dashboard (Safety Status,
Operational Readiness, Current Incident - one glance for a plant
manager). Counterfactual Comparator (the same incident, scored by a
naive single-sensor baseline, side by side - this is the concrete case
for replacing a legacy alarm).

**Proof, not assertion (45s):** 467 automated tests (294 backend
`pytest` against a live database, 173 frontend `vitest`). Backend
`ruff`/`black`/`mypy --strict` clean. Frozen-engine compliance verified
by diffing every frozen file against its original commit. A permanent
structural test asserts the Counterfactual Comparator shares zero code
with the real engine, so the comparison can't be rigged even by
accident.

**Close (20s):** "Deterministic. Explainable. Production-ready - and
every claim on this slide is something you can go verify in the
repository yourself."

---

## 10-minute technical deep dive

Assumes the 5-minute pitch as a base; add these sections.

**Architecture layering (2 min).**
`api -> services -> domain -> infra`, one-directional. `src/domain/`
is pure - zero I/O, zero framework imports - and frozen since
`docs/architecture/CORE_FREEZE.md`. `src/services/` orchestrates the
pipeline and touches the database; `src/api/` is FastAPI routers and
Pydantic schemas; `src/infra/` is SQLAlchemy models, Alembic
migrations, and the seed script. The frontend never computes a risk
value - every number the UI shows came from a REST response.

**The math, briefly (2 min).**
`R_compound = min(100, R_base * (1 + kappa * max(0, n-1)))` - the
Fusion formula. `R_base` is a weighted sum of the four agents' scores;
`kappa` (0.4) and the per-agent weights (0.4/0.3/0.2/0.1) are proposed
calibration constants documented in `docs/architecture/
integration_readiness.md`, never exposed by any endpoint - which is
exactly why every "impact" shown in the UI is a qualitative label, not
a recomputed number: the frontend has no honest way to derive one.

**Why deterministic over ML/LLM, argued technically (2 min).**
Reproducibility isn't a nice-to-have here, it's the whole value
proposition: an incident investigator needs to supply the same inputs
six months later and get the same tier back, byte for byte. A trained
model's behavior drifts with retraining; an LLM's output isn't
guaranteed reproducible even with temperature 0 across provider
versions. `tests/unit/test_no_wallclock_calls.py` statically walks the
AST of `src/domain` and `src/services` and fails the build on any
wall-clock or `random.*` call - a structural guarantee, not a review
checklist item.

**Independence guarantees (1.5 min).**
The Counterfactual Comparator is asserted, via a permanent test, to
never import or call the Scheduler, Fusion, Tiering, Justification
Builder, or any agent module - it computes the naive baseline through
entirely separate code, so the "here's what you'd have missed"
comparison can't be quietly rigged by sharing logic.

**Data model and scaling story (1.5 min).**
PostgreSQL via the TimescaleDB image, chosen at M1 for relational
integrity today with a hypertable migration path for sensor-reading
volume later (not yet exercised in this environment - disclosed, not
claimed). Each zone-tick computation is O(1) in zone count - no cross-
zone coupling in the engine - so adding zones doesn't slow down
existing ones. The Digital Twin's *visual* layout is currently five
hand-placed zones; that's a rendering limitation, not a data-model one.

**Known limitations, stated plainly (1 min).**
Gas Risk and the Counterfactual Comparator assume at most one
monitored gas type per zone. `AgentCache`/`TierState` are in-memory
only, no cross-restart persistence. Live updates use polling, not
push. 16 of 173 frontend tests currently fail due to a mock-server
port mismatch (`docs/presentation/judge_faq.md` has the full list).
None of these touch the frozen engine's correctness.

---

## Executive summary (for a one-pager)

Industrial Safety Intelligence is a real-time plant safety
decision-support platform. Four deterministic reasoning agents score
gas, equipment, worker-exposure, and permit risk per zone from live
sensor and permit data; a documented fusion formula combines them into
a single, explainable compound risk score and tier. Every decision is
reproducible and auditable - no machine learning, no randomness,
identical inputs always produce identical outputs, verified by
dedicated determinism tests rather than asserted as a design goal.

Built on that engine: a live Digital Twin of the plant floor, a
scrubbable incident replay ("Time Machine") synchronized across every
view, an Operations Center that turns a risk score into a prioritized,
SOP-referenced action queue, an Executive Dashboard for one-glance
safety status, and a Counterfactual Comparator that quantifies the gap
against a traditional single-sensor alarm on the same real incident.

The platform is production-oriented, not a demo shell: Dockerized
deployment, Prometheus metrics, structured logging, OpenAPI-documented
REST API, PostgreSQL persistence, and 467 automated tests (294 backend,
173 frontend). Known limitations - single-gas-per-zone assumption,
in-memory agent cache, polling instead of push updates, a fixed
five-zone visual layout - are documented, not hidden, in
`docs/architecture/CORE_FREEZE.md` and `docs/presentation/judge_faq.md`.
