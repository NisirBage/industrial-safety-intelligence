# Demo Script

Two scripts: a 7-minute full walkthrough for a judging panel with time
for questions, and a 3-minute rapid version for a lightning round.
Both assume the app is running (`Start Demo` works from anywhere, but
these scripts walk it manually so you can pause and narrate).

Every number spoken below is real, persisted output from the
deterministic engine's own replay of `scenarios/scenario_simops_conflict.yaml`
against the seeded demo plant - nothing here is a fabricated example.

---

## 7-Minute Walkthrough

**0:00 - 0:45 | The problem**
Open `/executive`. "This is a compressor station / tank farm. Traditional
industrial safety systems are single-sensor threshold alarms: a gas
sensor crosses a fixed ppm value, you get an alert. That misses
everything that isn't a single sensor crossing a single line - a
permit issued during a slow gas rise, two independent problems
compounding at once. That's what this platform catches."

Point at the KPI cards: Plant Health, Highest Risk Zone, Workers
Exposed, Counterfactual Misses. "Every number here is a real
computation, not a mock."

**0:45 - 2:00 | The plant map and live view**
Navigate to `/`. Point at the plant map - Tank Farm (tanks), Compressor
House (building), colored by real tier. Click a zone, or hover for the
quick-glance panel. "This isn't a static diagram - it's driven by
`GET /risk/current`, the same endpoint that backs every other page."

**2:00 - 3:30 | The core demonstration: Decision Comparison**
Navigate to `/comparison`. Scroll to "Tank Farm SIMOPS Conflict."
"CH4 is rising gradually in the Tank Farm. Partway through, a hot work
permit gets issued nearby. Neither signal alone crosses a hard
threshold - the naive system says CLEAR, ratio 0.90, meaning even the
worst single sensor reading is still under the alarm line. Our
compound engine says CRITICAL, score 99.9. Why? Fusion applies an
interaction bonus - a live permit and a rising gas reading, active at
the same time, are more dangerous together than either fact alone.
That's SIMOPS - simultaneous operations - and it's a real, named
category of industrial incident. A hard threshold has no way to see
it. Ours does, because it's not a threshold - it's cross-agent
fusion with saturating risk curves and tiering hysteresis."

**3:30 - 4:30 | Explainability and Research Mode**
Click "Explore this comparison in detail" -> land on Counterfactual.
Then navigate to `/explain/{assessment_id}` for the same tick: "Here's
the agent contribution chart - Gas Risk, Worker Exposure, Equipment
Status, Permit Intelligence, each with its own confidence, and the
plain-language recommendations derived from the tier and the rules
that fired." Then `/research/{assessment_id}`: "For a technical judge:
here is every stage of the pipeline, in order, click any box for its
input/output, and the raw persisted justification JSON at the bottom.
Nothing is hidden."

**4:30 - 5:30 | Live Incident Playback**
Navigate to `/scenarios/scenario_simops_conflict`, hit Play. "Watch the
plant map, the risk chart, the recommendations, and the naive-baseline
comparison all update off one shared timeline as the incident
unfolds." Let it run a few seconds, scrub to the divergence point.

**5:30 - 6:30 | Decision Journal and frozen-engine discipline**
Navigate to `/journal`. Filter by tier=critical. "Every persisted
assessment across every zone, searchable, expandable - full audit
trail." Mention: "The deterministic engine underneath - four agents,
fusion, tiering, justification, counterfactual - has been frozen since
an earlier milestone. Everything you've seen today is new UI and new
read-only endpoints built on top of it. Not one line of the math
changed."

**6:30 - 7:00 | Close**
"One button - Start Demo - runs this entire walkthrough automatically,
for a judge who wants to explore it unattended." Click it if time
allows, or gesture at the button.

---

## 3-Minute Rapid Demo

**0:00 - 0:20** - `/executive`: "Plant-wide KPIs, real computations."

**0:20 - 1:20** - `/comparison`, Tank Farm SIMOPS Conflict card: "Naive
threshold system says CLEAR. Our compound engine says CRITICAL. Why:
[read the Why box aloud]. That's the whole platform's thesis in one
screen."

**1:20 - 2:00** - Click through to `/explain/{id}`: agent contribution
chart + recommendations, 15 seconds each.

**2:00 - 2:40** - `/scenarios/scenario_simops_conflict`, hit Play,
narrate the plant map/chart updating together for 20 seconds.

**2:40 - 3:00** - "Deterministic engine frozen, zero ML, full test
coverage, one button reruns this whole tour - Start Demo." Close.
