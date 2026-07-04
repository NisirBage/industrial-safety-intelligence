# Common Judge Questions

Sharper, more skeptical questions than `faq.md` - the ones a technical
judge is likely to ask to probe whether the engineering claims hold up.

**"Why not just use an LLM or an ML model here? Wouldn't that be more
impressive?"**
Because industrial safety decisions need to be auditable and
reproducible - a regulator or an incident investigator needs to be
able to reconstruct exactly why a system said "critical" six months
ago, with the same inputs producing the same output every time. An
LLM or a trained model can't give you that guarantee cheaply. This
platform's entire pitch is the opposite bet: get real value out of
deterministic, explainable reasoning before reaching for a black box.
(M12's originally-scoped anomaly-detection extension point was
deliberately left unbuilt for exactly this reason - see
`docs/architecture/CORE_FREEZE.md` section 12.)

**"How do you actually know it's deterministic? Have you tested that,
or is it just a design goal?"**
Tested, not assumed. There's an AST-walking unit test
(`tests/unit/test_no_wallclock_calls.py`) that statically scans
`src/domain` and `src/services` for wall-clock calls and fails the
build if it finds one. Every agent, Fusion, Tiering, Justification,
and the Risk Pipeline itself have dedicated determinism tests that run
identical inputs twice and assert identical outputs.

**"What stops the compound engine and the counterfactual comparator
from secretly sharing logic, making the comparison meaningless?"**
A permanent structural test enforces it: the Counterfactual Comparator
is asserted to never import, call, or otherwise share code with
`scheduler.py`, `risk_formula.py`, `tiering.py`, `justification.py`, or
any agent module. It's independent by construction, not by
convention.

**"Is any of this frozen-engine claim actually verified, or just
asserted in a comment?"**
Verified via git history: every frozen module's current content was
diffed against its original milestone commit
(`git show <commit>:<file> | diff`) and confirmed byte-identical as
part of an independent audit before this UI-focused milestone began.
No `Edit`/`Write` call has touched a frozen file since.

**"Your recommendation engine - is that just an LLM prompt in
disguise?"**
No. It's a lookup table: tier -> canned action text, and fired-rule-id
-> canned action text, both hardcoded in
`frontend/src/lib/recommendations.ts`. It derives nothing from raw
numbers and calls no external model.

**"What's the actual test coverage here?"**
261 backend tests (pytest, against a live PostgreSQL instance) and a
growing suite of frontend unit tests for every pure-logic helper this
milestone introduced (timeline scrubbing, justification parsing,
recommendation derivation, pipeline-stage attribution, executive KPI
math, decision-comparison picking/explaining) - all passing. `ruff`,
`black --check`, and `mypy --strict` are all clean on the backend;
`oxlint`, `tsc --noEmit`, and a production `vite build` are all clean
on the frontend.

**"What would you build next if you had another week?"**
Two things flagged honestly during this session: (1) a real worker
headcount is now exposed per zone (`GET /zones/{id}/workers/count`),
but it's not yet fed into a dedicated "who's in the blast radius"
visualization; (2) the Gas Risk agent and Counterfactual Comparator
both assume at most one monitored gas type per zone - a documented,
known limitation (`docs/architecture/CORE_FREEZE.md` section 12), not
a hidden bug.

**"Is there a license? Can I actually use this?"**
Not yet - see the README's license section. That's a business
decision outside this engineering work's scope, called out explicitly
rather than silently assumed.
