# Poster Content Plan

Content and layout for a single-page hackathon poster (A1/A0 print or
a static image for a submission gallery). This document is the poster's
copy and layout, not a rendered image — pair with `docs/demo/
architecture_animation_plan.md` for the diagram source, and pull
screenshots per `docs/demo/portfolio_screenshots.md`.

## Layout (top to bottom, single column, three-column mid-section)

### Header band

- **Title:** Industrial Safety Intelligence
- **Subtitle:** A deterministic Decision Intelligence platform for
  industrial plant safety — no LLM, no black box, in the risk decision
  path.
- Small badge row: "261 backend tests" · "72 frontend tests" · "Zero
  randomness in risk computation"

### Left column — The Problem

- One paragraph, matching `slides.md` slide 2: single-sensor
  thresholds miss compounding risk.
- The one killer number, large and bold: naive baseline **CLEAR**
  (ratio 0.90) vs. compound engine **CRITICAL** (99.9) — same sensor
  data, `/comparison` screenshot inset.

### Center column — The Architecture

- The pipeline diagram: Sensors → Context Builders → 4 agents →
  Fusion → Tiering → Justification → Recommendations, drawn exactly as
  `docs/architecture/pipeline.md` and the live `PipelineDiagram`
  component render it (same shapes, same order — see
  `architecture_animation_plan.md`'s "Source of truth" note).
- One-line callouts under each stage naming the actual frozen module
  (`src/domain/agents/gas_risk.py`, etc.) — a technical judge should be
  able to go straight from the poster to the file.

### Right column — What It Looks Like

- Three screenshots (see `portfolio_screenshots.md` for exact routes/
  moments): the Plant Map (Overview), the Digital Twin replay mid-scrub
  on the SIMOPS scenario, and the Executive Command Center.
- Caption under each: one sentence, factual, no adjectives beyond what
  the screen itself shows (matching this project's own screenshot
  discipline in the top-level README).

### Footer band

- QR code / URL to the repo.
- One line: "Every number on this poster was read from a live run of
  the system, not fabricated for print." (True only if whoever
  produces the final poster actually re-captures the screenshots and
  numbers immediately before printing — see the freshness note below.)

## Freshness note

The specific numbers above (99.9, 0.90, 261, 72) are accurate as of
this milestone's validation pass (`docs/demo/technical_highlights.md`
and the M12 final deliverables report). Before printing, re-run the
validation suite and the `/comparison` scenario once more and update
any number that has drifted — this document intentionally does not
hardcode a "final" test count, since counts change as tests are added.
