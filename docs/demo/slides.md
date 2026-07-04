# Slide Deck Outline

A 12-slide outline for a judged pitch (pairs with `demo_script.md`'s
7-minute walkthrough — each slide below names the moment in that
script it supports, so the deck and the live demo stay in lockstep
rather than drifting into two separate stories).

## 1. Title

"Industrial Safety Intelligence — a deterministic Decision
Intelligence platform for industrial plant safety." Subtitle: no LLM,
no black box, in the risk decision path.

## 2. The problem

Plant safety incidents compound: a single elevated gas reading rarely
triggers action on its own, but the *same* reading alongside an active
hot-work permit and a degraded gas sensor should. Naive single-sensor
thresholds miss this. One real number to anchor it: the SIMOPS
Conflict scenario's naive baseline reads CLEAR (ratio 0.90) while the
compound engine reads CRITICAL (99.9) for the identical sensor data —
shown live on `/comparison`.

## 3. What's frozen, and why

One slide, the whole claim: four independent reasoning agents (Gas
Risk, Equipment Status, Worker Exposure, Permit Intelligence), a
weighted-sum Fusion step with an interaction bonus, and a hysteresis
Tiering engine — all plain, tested, deterministic functions. No
training, no prompt, no randomness. Point at
`docs/architecture/CORE_FREEZE.md`.

## 4. Live: Plant Map (supports demo_script.md step 1)

Screen share `/` (Overview). Talk through the SVG site plan: tier
color per zone, worker-count badge, active-permit clipboard icon,
equipment-status gear, gas-heat glow, and the pulsing red outline on
the zone currently at CRITICAL.

## 5. Live: Digital Twin replay (step 2)

Screen share `/scenarios/scenario_simops_conflict`. Scrub the
timeline; call out that the plant map, the per-zone risk cards, the
recommendation list, and the plant-wide summary strip at the top all
move together from one shared cursor — nothing here is four separate
components polling four separate endpoints out of sync.

## 6. Live: Explainability / Decision Graph (step 3)

Screen share `/research/<assessment_id>`. Click through
Sensors → Context Builders → the four agents → Fusion → Tiering →
Recommendations. Every number in the detail panel is the exact
persisted value, never recomputed for display.

## 7. Live: Counterfactual (step 4)

Screen share `/comparison`. This is the single strongest slide in the
deck — the naive-baseline-misses-it moment from slide 2, proven live
rather than asserted.

## 8. Live: Executive Command Center (step 5)

Screen share `/executive`. Plant Readiness, Active Alerts, Action
Centre, and the KPI grid — the same underlying assessments, reframed
for a plant manager rather than an engineer.

## 9. Live: Decision Journal (step 6)

Screen share `/journal`. Every escalation, searchable, filterable, with
expandable reasoning — an audit trail a safety officer could actually
use after an incident, not just during a demo.

## 10. Engineering discipline

Three numbers: 261 backend tests (unit + real-Postgres integration),
72 frontend tests (Vitest + React Testing Library + MSW), and a
structural test that fails the build if any wall-clock call ever
enters `src/domain/`. Point at `docs/demo/technical_highlights.md`.

## 11. What's deliberately not built yet

One honest slide: no push/WebSocket updates (polling only), no
authentication, no hash-chained audit writer yet (the read endpoint
exists and correctly returns empty). See README's "Future work" — a
judge who asks "what would you build next" gets an answer already
written down, not improvised.

## 12. Close

Restate the one-sentence pitch from slide 1, then the `/comparison`
number from slide 2 one more time as the closing beat — the judges
should leave remembering one concrete proof point, not a feature list.
