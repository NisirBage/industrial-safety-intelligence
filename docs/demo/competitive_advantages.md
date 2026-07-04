# Competitive Advantages

What sets this submission apart from a typical hackathon entry in the
same problem space.

## 1. It proves its own value proposition with real data, not a slide

Most "AI for industrial safety" pitches assert that a smarter system
would catch things a dumb one misses. This one shows it, live, on
`/comparison`: a real naive-threshold verdict (CLEAR, ratio 0.90)
next to a real compound-engine verdict (CRITICAL, score 99.9) for the
exact same sensor data, with the exact mechanism (an interaction
bonus) named in the explanation. There is no gap between the claim and
the demo.

## 2. Deterministic, not a black box - and that's a deliberate,
defensible choice

The temptation in a hackathon is to bolt on an LLM or a trained model
for the "wow" factor. This platform explicitly didn't, because
industrial safety decisions need to be reproducible and auditable in a
way a black box can't cheaply provide. Every one of the four
reasoning agents, the fusion step, and the tiering hysteresis is a
plain function with a documented formula - and it's tested to actually
be deterministic (an AST-walking test blocks any wall-clock call from
ever entering the codebase), not just claimed to be.

## 3. Explainability isn't a feature, it's the architecture

Three different depths of "why" (Explainability, Research Mode,
Decision Journal) all read the same underlying persisted
`justification` record - there's no separate summarization step that
could drift from what the engine actually computed. A judge can open
Research Mode, click every pipeline stage, and see the raw JSON.
Nothing is hidden behind a UI abstraction.

## 4. The engineering discipline is verifiable, not asserted

"We froze the core engine" is a common claim. This project backs it
with a git-diff audit trail, a permanent structural test that would
fail the build if the Counterfactual Comparator ever imported
compound-engine code, and a documented, itemized list of known
limitations rather than silence on the gaps (see
`docs/architecture/CORE_FREEZE.md` section 12). A technical judge who
digs in will find the claims hold up.

## 5. Built for the room, not just the code

Presentation Mode (full-screen, large type, minimal chrome,
keyboard-shortcut toggle) and Demo Mode (one button, fully automated
walkthrough of the platform's own strongest evidence) exist because a
judging round is time-boxed and often noisy. The platform is designed
to present itself well under those exact constraints, not just to
function correctly in isolation.

## 6. Depth without scope creep

Ten ordered UI/UX milestones were built on top of an already-frozen,
already-tested engine without adding a single new mathematical model,
without touching `src/domain/`, and without introducing any
randomness or LLM dependency anywhere. Every new capability is
additive and read-only. That's a harder constraint to build under than
"add whatever gets the demo working," and the result is a system a
judge can trust wasn't held together by last-minute hacks.
