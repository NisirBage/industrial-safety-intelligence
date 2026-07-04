# Portfolio Screenshots Checklist

Consistent with this repository's existing policy (top-level
`README.md`'s "Screenshots" section): no fabricated or stale static
images are committed here. This is the exact list of routes and
moments to capture, with the real data state each one needs — run the
app locally, reach that state, and capture then. Every entry below was
live-verified to render correctly against a real backend during this
milestone's validation pass (M12.6); none is speculative.

For each entry: **route** → **state to reach it** → **what the shot
should prove**.

1. **Plant Map** — `/` (Overview), after replaying at least one
   scenario with an active permit and a non-zero gas reading in one
   zone. Proves: SVG site plan, tier-colored zone, worker-count badge,
   permit icon, equipment gear, gas-heat glow, and (if a zone is
   CRITICAL) the pulsing outline — all in one frame.

2. **Digital Twin mid-replay** — `/scenarios/scenario_simops_conflict`,
   scrubber at roughly 50% through the timeline. Proves: the
   plant-wide summary strip, plant map, per-zone card, pipeline
   diagram, and recommendation list all reflect the same scrub
   position at once.

3. **Decision Graph / Research Mode** — `/research/<assessment_id>`
   with one pipeline stage clicked open (Fusion is the most
   illustrative — shows the interaction-bonus number). Proves: the
   DAG is interactive and the detail panel surfaces real persisted
   values.

4. **Counterfactual Comparison** — `/comparison`, on a scenario/moment
   where the naive baseline misses an active escalation (the SIMOPS
   scenario at its peak is the strongest case). Proves: the platform's
   single best evidence-based claim, live.

5. **Executive Command Center** — `/executive`, with at least one
   zone above NORMAL. Proves: the KPI grid, Plant Readiness card,
   Active Alerts list, and Action Centre together.

6. **Decision Journal** — `/journal`, with a search or filter applied.
   Proves: the audit-trail use case, not just a raw list.

7. **Presentation Mode** — any page, immediately after pressing `P`.
   Proves: full-screen, minimal-chrome layout for projector use.

8. **Demo Mode banner** — any page, immediately after clicking "Start
   Demo." Proves: the one-button guided tour exists and is mid-step.

## Capture discipline

- Capture at the desktop preset (1280×800) unless a specific
  responsive claim is being made — don't mix window sizes across the
  set.
- Do not crop out the nav bar; a judge should see which route produced
  each shot without a separate caption.
- Re-capture this whole set any time a scenario file, KPI card, or
  route changes — a screenshot of a page that no longer looks like
  this is worse than no screenshot.
