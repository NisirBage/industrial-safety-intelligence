# Architecture Animation Plan

A shot-by-shot plan for a short (60-90s) animated walkthrough of the
pipeline, for judges who want the system's shape before its screens.
This is a plan for a video/GIF an editor can produce — it is not
itself an animation, and nothing here is generated or claimed to
exist yet.

## Source of truth

Every shape and label in this animation must trace back to
`docs/architecture/pipeline.md` (the frozen execution graph) and the
live `PipelineDiagram` component (`frontend/src/components/
explainability/PipelineDiagram.tsx`) — the animation dramatizes the
same graph the app already renders and lets a user click through
live; it must never show a stage, arrow, or label the app itself
doesn't have.

## Shot list

1. **(0-5s) Cold open.** A single gas sensor reading appears as a
   number ticking upward against a flat, empty plant silhouette.
   Caption: "One reading. On its own, ambiguous."

2. **(5-15s) Sensors → Context Builders.** The reading fans out into
   four small icons (Gas Risk, Equipment Status, Worker Exposure,
   Permit Intelligence), each drawing from its own independent data
   source (a second sensor, an equipment log, a worker-location
   record, a permit record) - emphasize *independent*: no icon reads
   another icon's output.

3. **(15-30s) The four agents compute in parallel.** Each icon
   produces a small risk/confidence pair. Hold on this frame long
   enough to read all four numbers - this is the moment that
   justifies "four independent reasoning agents," not a marketing
   phrase.

4. **(30-45s) Fusion.** The four pairs converge into one weighted-sum
   box. When more than one agent is elevated at once, show the
   interaction-bonus multiplier visibly applying (a small ×1.4 or
   similar badge lighting up) - this is the single mechanic that
   explains the naive-baseline-misses-it story from `slides.md` slide
   2, so it deserves its own beat, not a blur-past.

5. **(45-55s) Tiering.** The compound score crosses into a colored
   tier band (NORMAL → WATCH → ELEVATED → CRITICAL), with a visible
   "holds for N ticks" dwell indicator - the hysteresis behavior that
   keeps the system from chattering on a noisy reading near a
   threshold.

6. **(55-70s) Justification + Recommendations.** The tier lands, and
   a small panel unfurls showing the fired rule names and a
   recommended action - visually this should look exactly like
   clicking a node in `/research/<id>` today, because it is the same
   data.

7. **(70-85s) Zoom out to the plant map.** The single zone's outcome
   drops into its place on the full site plan, other zones already
   present and colored - reinforcing that this whole sequence runs
   once per zone per tick, continuously, not as a one-off.

8. **(85-90s) End card.** "Every step here is a deterministic
   function. No LLM in this path." with a link to
   `docs/architecture/CORE_FREEZE.md`.

## Production notes

- Reuse the exact tier colors from `frontend/src/index.css`'s
  `--tier-*` custom properties, not new ones invented for the video —
  a judge who watches the video and then opens the live app should see
  the same palette.
- No stage should be relabeled or reordered for pacing; if a stage
  needs to be cut for time, cut a caption, not a box in the graph.
- Voiceover script should be pulled sentence-for-sentence from
  `demo_script.md` where the two overlap (the Fusion/interaction-bonus
  explanation especially), so the recorded narration and the live-demo
  narration never contradict each other.
