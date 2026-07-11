"""M24 Part 6 (Lessons Learned) - a deterministic lookup table from
real rule identifiers (the exact 21 strings the frozen engine can ever
fire - see `docs/architecture/historical_intelligence.md` for the full
list, cross-checked against `frontend/src/lib/pipelineStages.ts`'s own
copy) to authored guidance text.

This mirrors the same pattern `frontend/src/lib/recommendations.ts`
already established for canned recommendation text keyed by tier/rule:
a lookup table, not a model. Every entry here is commentary this
project's authors wrote about *this platform's own simulated scenario
mechanics* - it never claims to describe a real external industrial
accident. Rules with no entry below get the documented fallback rather
than a fabricated one, since not every rule identifier represents a
distinct actionable lesson (e.g. "operated within policy" rules).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Lesson:
    rule: str
    lesson: str


#: Only rules with a genuinely distinct, actionable lesson get an
#: entry - see module docstring for why the rest fall through to
#: `_FALLBACK_LESSON` instead of a forced, padded-out entry.
_RULE_LESSONS: dict[str, str] = {
    "missing_data_fail_safe": (
        "A sensor reading was missing this tick and the engine substituted a conservative "
        "fail-safe value rather than ignoring the gap. Treat the missing feed itself as a "
        "maintenance signal, independent of whatever risk score the fallback produced."
    ),
    "stale_data_fail_safe": (
        "A sensor reading had gone stale and the engine decayed toward a conservative value "
        "rather than trusting an old reading indefinitely. A stale feed for this long is worth "
        "investigating on its own, even if the decayed risk score looks unremarkable."
    ),
    "missing_equipment_context": (
        "Equipment inventory context was unavailable this tick. The engine did not assume "
        "equipment was healthy by default - review why the inventory feed was unavailable."
    ),
    "common_cause_grouped_degradation_count": (
        "Multiple equipment items degraded together rather than independently. Investigate the "
        "shared root cause (power, common utility, maintenance batch) rather than treating each "
        "failure as isolated - simultaneous failures compound faster than the same failures "
        "spread over time."
    ),
    "missing_location_fail_safe": (
        "Worker location data was unavailable this tick, and the engine used a conservative "
        "fail-safe headcount rather than assuming the zone was empty. Confirm the location feed "
        "before relying on headcount alone for evacuation planning."
    ),
    "unauthorized_presence": (
        "Workers were present in a zone without an active, matching permit. Review access-control "
        "and permit-issuance timing so presence and authorization are never out of sync in this "
        "zone."
    ),
    "permit_status_escalated": (
        "An already-issued permit's risk escalated after issuance as zone conditions changed. "
        "Permits should be revisited when conditions materially change, not only checked once at "
        "issuance."
    ),
    "interaction_bonus_applied": (
        "Multiple agents were concurrently elevated, and Fusion's interaction bonus compounded "
        "the combined risk faster than any single factor would suggest. Treat simultaneous "
        "elevated signals as a SIMOPS-style conflict requiring an immediate cross-check between "
        "the involved work streams, not as independent alarms to triage one at a time."
    ),
    "tier_escalated": (
        "Operational status crossed a threshold and held past the hysteresis dwell requirement, "
        "meaning this is a confirmed escalation, not a single noisy reading. Respond accordingly "
        "rather than waiting for further confirmation."
    ),
    "tier_de_escalated": (
        "Operational status fell and held past the hysteresis dwell requirement, confirming a "
        "sustained improvement rather than one calm reading. Safe to stand down monitoring "
        "frequency once this rule has fired, not before."
    ),
    "agent_unavailable_using_last_known": (
        "An agent's output was unavailable this tick and the Scheduler substituted its decayed "
        "last-known value rather than excluding it from Fusion. An agent going unavailable "
        "repeatedly is itself worth escalating as a monitoring-infrastructure issue."
    ),
}

_FALLBACK_LESSON = (
    "This rule reflects normal/within-policy operation for this tick - it does not carry a "
    "distinct lesson beyond confirming the engine behaved as designed."
)


def lesson_for_rule(rule: str) -> Lesson:
    """Deterministic, total function - every rule identifier the
    frozen engine can fire gets *some* lesson text, never a KeyError,
    and the fallback is honestly generic rather than invented detail."""
    return Lesson(rule=rule, lesson=_RULE_LESSONS.get(rule, _FALLBACK_LESSON))


def lessons_for_rules(rules_fired: list[str]) -> list[Lesson]:
    """One `Lesson` per fired rule, in the order the engine reported
    them, de-duplicated by rule identifier (a rule firing twice across
    an incident's ticks should only produce one lesson card, not one
    per occurrence)."""
    seen: set[str] = set()
    lessons: list[Lesson] = []
    for rule in rules_fired:
        if rule in seen:
            continue
        seen.add(rule)
        lessons.append(lesson_for_rule(rule))
    return lessons
