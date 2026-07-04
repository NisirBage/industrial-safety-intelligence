# Judge Walkthrough

A self-guided path for a judge exploring the platform independently,
with no presenter narrating. Each step names the exact URL/action and
what to look for. Everything is real data from a live PostgreSQL
database and a live FastAPI backend - nothing is mocked.

## Fastest path: one button

Click **Start Demo** in the top navigation bar from anywhere in the
app. It will, unattended:

1. Load the flagship scenario (`scenario_simops_conflict`) and start
   playing its replay.
2. Open Explainability for the single most dramatic real divergence
   that scenario contains.
3. Open Research Mode for the same assessment (every pipeline stage).
4. Open the Counterfactual comparison for the same zone/tick.
5. Open the Executive Overview.

A banner at the top shows progress and an "Exit Demo" button if you
want to stop early and explore manually.

## Manual path, if you'd rather drive

1. **`/executive`** - Plant Health, Highest Risk Zone (with a real
   sparkline), Active Critical Permits, Workers Exposed, Average
   Compound Score, Counterfactual Misses, Today's Incidents, Open
   Recommendations. Every card is a derived count/average over
   already-computed values - refresh the page, the numbers don't move
   unless the underlying data does.

2. **`/comparison`** - the single strongest page. For each of the
   three seeded scenarios, the most dramatic real moment where a
   traditional single-sensor threshold system and this platform's
   compound engine disagree, with a grounded "why."

3. **`/`** (Overview) - the plant map. Hover a zone for a quick
   summary, click to open its detail page. Colors and shapes are
   driven by live tier data; watch a color transition smoothly if you
   toggle "Live polling" and wait for a refresh.

4. **`/scenarios`** - three deterministic, pre-authored incidents.
   Open any one, hit Play. The plant map, risk chart, recommendations,
   and naive-baseline comparison all update from one shared playhead.

5. **`/explain/{assessmentId}`** (reachable from any zone or the
   comparison page) - agent contribution chart, rules fired, tier
   transition, plain-language recommended actions.

6. **`/research/{assessmentId}`** - the same assessment, but every
   pipeline stage laid out in execution order with a clickable
   diagram, plus the raw persisted `justification` JSON at the bottom.
   This is the page to open if you want to verify nothing is hidden.

7. **`/journal`** - every persisted assessment, across every zone,
   searchable and filterable by tier/zone, each entry expandable to
   the same detail as Explainability.

8. **`/counterfactual`** - pick any zone and any historical tick from
   its own real assessment timeline, see the naive baseline and the
   compound engine side by side for that exact moment.

## What to press on, if you want to stress-test it

- **Presentation Mode** (button, or press `P`) - hides navigation,
  goes full-screen, enlarges typography. Press `Esc` or click "Exit
  Presentation" to leave.
- Resize the browser to a phone width - the layout reflows to a single
  column; nothing overlaps.
- Open browser dev tools -> Network tab - every page's data comes from
  a `GET /api/v1/...` call you can inspect directly.
- `GET /api/v1/health` reports database connectivity and migration
  version, not just "the process is alive."

## What's deliberately *not* here

- No login/auth (out of scope for a hackathon judging window).
- No live simulation trigger - scenarios are pre-authored YAML,
  replayed once through the real pipeline and persisted; the "replay"
  pages scrub through that persisted history, they don't re-simulate.
- No LLM, no ML model, no randomness anywhere in the risk computation.
