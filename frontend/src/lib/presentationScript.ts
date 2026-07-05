import type { RiskAssessment } from "../api/types";
import type { ScenarioSummary } from "../api/types";
import type { RiskJustification } from "./justification";
import { agentDisplayName } from "./justification";

export interface PresentationScene {
  index: number;
  key: string;
  title: string;
  durationMs: number;
}

/**
 * Item 2 (Story Timeline) - the fixed, authored sequence of scenes
 * and their on-screen durations. A plain data table, not logic - the
 * scene *content* for each entry is a React component keyed by
 * `key`, defined in `pages/PresentationModePage.tsx`. Durations sum to
 * ~90s, matching the "judge understands the project within 90
 * seconds" objective; Scene 1 is fixed at 3s per the explicit spec.
 */
export const PRESENTATION_SCENES: PresentationScene[] = [
  { index: 0, key: "title", title: "Industrial Safety Intelligence", durationMs: 3000 },
  { index: 1, key: "digital-twin", title: "Live Digital Twin", durationMs: 8000 },
  { index: 2, key: "incident", title: "Incident Detected", durationMs: 10000 },
  { index: 3, key: "pipeline", title: "AI Decision Engine", durationMs: 12000 },
  { index: 4, key: "decision-graph", title: "Decision Graph", durationMs: 10000 },
  { index: 5, key: "operations", title: "Operations Center", durationMs: 12000 },
  { index: 6, key: "executive", title: "Executive Dashboard", durationMs: 8000 },
  { index: 7, key: "counterfactual", title: "Counterfactual", durationMs: 10000 },
  { index: 8, key: "replay", title: "Time Machine Replay", durationMs: 10000 },
  { index: 9, key: "closing", title: "Closing", durationMs: 8000 },
];

export const TOTAL_PRESENTATION_DURATION_MS = PRESENTATION_SCENES.reduce(
  (sum, scene) => sum + scene.durationMs,
  0,
);

export interface SceneTalkingPoints {
  presenterNotes: string;
  judgeTakeaway: string;
  technicalDetail: string;
  businessValue: string;
}

/**
 * Part 8 (Guided Talking Points) - shown only in Judge Mode
 * (`PresentationModePage.tsx`'s `judgeMode` toggle), never in the
 * plain judge-facing tour. Every field is authored presenter
 * guidance, condensed from `docs/presentation/demo_script.md` - not a
 * new computation, just a structured view of the same narration
 * already written out in full there.
 */
export const SCENE_TALKING_POINTS: Record<string, SceneTalkingPoints> = {
  title: {
    presenterNotes:
      "\"This is Industrial Safety Intelligence - a deterministic, explainable early-warning platform.\"",
    judgeTakeaway: "Every number on this slide is live - nothing scripted.",
    technicalDetail: "Sourced from GET /zones, GET /risk/current, GET /permits.",
    businessValue: "A plant manager sees operational status at a glance, no training required.",
  },
  "digital-twin": {
    presenterNotes: "\"Here's the plant as a digital twin - not a static diagram.\"",
    judgeTakeaway: "Permit icons are shape-coded by real permit type - point at one if active.",
    technicalDetail: "Site-plan layout is a fixed table of five named zones - a disclosed limitation, not hidden.",
    businessValue: "One screen replaces walking the plant floor to check status.",
  },
  incident: {
    presenterNotes: "\"Watch what happens when a real incident starts.\"",
    judgeTakeaway: "This tick is the first real index whose tier isn't normal - never hand-picked.",
    technicalDetail: "lib/presentationScript.ts::findFirstEscalationIndex over real replay history.",
    businessValue: "Early detection is the entire point of an early-warning system.",
  },
  pipeline: {
    presenterNotes: "\"Four independent deterministic agents combine through Fusion.\"",
    judgeTakeaway: "\"Deterministic\" is a hard claim - ask what happens if you run it twice.",
    technicalDetail: "Every score is a documented closed-form formula - saturating curve, weighted sum, hysteresis gate.",
    businessValue: "No AI/ML in the decision path means no unexplainable false positives.",
  },
  "decision-graph": {
    presenterNotes: "\"Here's why the score is what it is.\"",
    judgeTakeaway: "The percentage is a relative share of real numbers, not the literal Fusion weight.",
    technicalDetail: "computeRelativeShares: risk_i / sum(risk_j) x 100, explicitly labeled as a normalization.",
    businessValue: "An auditor can trace exactly which factor drove the decision.",
  },
  operations: {
    presenterNotes: "\"The platform doesn't just detect - it recommends.\"",
    judgeTakeaway: "Impact levels are qualitative by design - never a fabricated risk-reduction number.",
    technicalDetail: "buildActionQueue attaches ETA/dependencies/personnel from a config table, not a model.",
    businessValue: "An operator gets a prioritized to-do list, not just an alarm.",
  },
  executive: {
    presenterNotes: "\"For a plant manager, one screen: is the plant ready to operate?\"",
    judgeTakeaway: "Business impact is a categorical label over the real tier, not a dollar estimate.",
    technicalDetail: "Reuses plantReadiness/averageCompoundScore, already computed for every other page.",
    businessValue: "Answers the one question a plant manager actually has time to ask.",
  },
  counterfactual: {
    presenterNotes: "\"The naive baseline - a single-sensor threshold alarm.\"",
    judgeTakeaway: "\"Without Permit\"/\"Equipment Restored\" are qualitative-only, disclosed, never a computed score.",
    technicalDetail: "explainComparison reused unchanged from the Decision Comparison milestone.",
    businessValue: "This is the concrete case for replacing a legacy single-sensor alarm system.",
  },
  replay: {
    presenterNotes: "\"Every tick you just saw is scrubbable.\"",
    judgeTakeaway: "This is the same Time Machine an operator or auditor uses after a real incident.",
    technicalDetail: "ReplayController reused unchanged; one shared ReplayContext across every page.",
    businessValue: "Incident review/audit trail without a separate logging system.",
  },
  closing: {
    presenterNotes: "\"Deterministic. Explainable. Production ready.\"",
    judgeTakeaway: "Every stat is grep-verified against this repository, not estimated.",
    technicalDetail: "See PLATFORM_STATS's own docstring for the exact verification method per number.",
    businessValue: "A demonstrably real, tested system - not a slide deck.",
  },
};

/** Milliseconds elapsed at the start of a given scene index - used
 * for the progress bar and "estimated remaining time" readout. */
export function elapsedBeforeScene(sceneIndex: number): number {
  return PRESENTATION_SCENES.slice(0, sceneIndex).reduce((sum, scene) => sum + scene.durationMs, 0);
}

export function remainingAfterScene(sceneIndex: number): number {
  return TOTAL_PRESENTATION_DURATION_MS - elapsedBeforeScene(sceneIndex) - PRESENTATION_SCENES[sceneIndex].durationMs;
}

/**
 * Item 3 (Incident Begins) - which real catalog scenario the guided
 * tour replays. A deterministic selection rule over already-real
 * catalog metadata (title/key keyword match), never a fabricated
 * scenario - prefers one that actually demonstrates escalation and
 * interaction-bonus compounding (SIMOPS/critical in its name), falls
 * back to the first cataloged scenario so the tour always has
 * something real to show even if the catalog changes.
 */
export function selectPresentationScenario(scenarios: ScenarioSummary[]): ScenarioSummary | null {
  if (scenarios.length === 0) {
    return null;
  }
  const dramatic = scenarios.find(
    (s) => /simops|critical/i.test(s.key) || /simops|critical/i.test(s.title),
  );
  return dramatic ?? scenarios[0];
}

/** First index (ascending order) where the tier leaves "normal" -
 * the moment an incident is first detectable in this real replay
 * window. Returns 0 if the scenario never leaves normal (nothing to
 * find, but still a valid moment to show), or if the list is empty. */
export function findFirstEscalationIndex(assessments: RiskAssessment[]): number {
  const index = assessments.findIndex((assessment) => assessment.tier !== "normal");
  return index === -1 ? 0 : index;
}

/** Index of the single highest compound_risk_score tick - the "peak"
 * moment the pipeline/decision-graph/operations scenes anchor on,
 * matching the same "most dramatic real moment" selection already
 * established in `lib/decisionComparison.ts::pickComparisonMoment`. */
export function findPeakIndex(assessments: RiskAssessment[]): number {
  if (assessments.length === 0) {
    return 0;
  }
  let bestIndex = 0;
  let bestScore = assessments[0].compound_risk_score;
  assessments.forEach((assessment, index) => {
    if (assessment.compound_risk_score > bestScore) {
      bestScore = assessment.compound_risk_score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

export interface RelativeShare {
  agentName: string;
  displayName: string;
  risk: number;
  /** This agent's raw risk as a share of the sum of all agents' raw
   * risk this tick (`risk_i / Σrisk_j × 100`) - a plain normalization
   * of already-persisted numbers, explicitly NOT the real Fusion
   * weight `w_i` (which no endpoint exposes), and never asserted to
   * be one. */
  sharePercent: number;
}

/** Item 5 (Decision Graph "show percentages") - relative share of
 * each agent's already-persisted raw risk contribution. When every
 * agent's risk is 0 (a fully quiet tick), every share is 0 rather
 * than dividing by zero. */
export function computeRelativeShares(justification: RiskJustification | null): RelativeShare[] {
  if (!justification) {
    return [];
  }
  const entries = Object.entries(justification.agentContributions);
  const total = entries.reduce((sum, [, contribution]) => sum + contribution.risk, 0);
  return entries
    .map(([agentName, contribution]) => ({
      agentName,
      displayName: agentDisplayName(agentName),
      risk: contribution.risk,
      sharePercent: total > 0 ? (contribution.risk / total) * 100 : 0,
    }))
    .sort((a, b) => b.risk - a.risk);
}

export interface PlatformStat {
  label: string;
  value: number;
  suffix?: string;
}

/**
 * Item 10 (Closing) - platform facts, each independently verified
 * against the actual codebase (not estimated): 4 agent modules under
 * `src/domain/agents/`, 21 distinct deterministic rule identifiers
 * (counted directly from every `rules_fired`/tier-transition-label
 * call site across the four agents, Fusion, the Scheduler, and the
 * Justification Builder), 19 REST routes (17 GET + 2 POST across
 * `src/api/routers/*.py`), 21 frontend pages (`frontend/src/pages/
 * *.tsx`, including this one), and 467 automated tests (294 backend
 * `pytest` via `python -m pytest --collect-only -q`, 173 frontend
 * `vitest` via `npx vitest run`, re-verified during the M18.5
 * milestone - this count grew from an earlier 449/155 figure as later
 * milestones added tests without updating this constant, corrected
 * here rather than left stale). 16 of the 173 frontend tests
 * currently fail for one disclosed, non-architectural reason (a mock
 * server port mismatch) - see `docs/presentation/judge_faq.md`'s
 * Limitations section. If these numbers ever drift again, re-verify
 * with the same commands rather than guessing a new one.
 */
export const PLATFORM_STATS: PlatformStat[] = [
  { label: "Deterministic agents", value: 4 },
  { label: "Deterministic rule identifiers", value: 21 },
  { label: "REST API endpoints", value: 19 },
  { label: "Frontend pages", value: 21 },
  { label: "Automated tests", value: 467 },
];

/** Boolean production-readiness facts, shown alongside the numeric
 * stats - each backed by a real file/module in this repository
 * (`deploy/`, `src/api/routers/metrics.py`, expanded OpenAPI metadata
 * in `src/api/main.py`, `postgresql+psycopg` in `src/config/
 * settings.py`, `src/config/logging.py`), never asserted without one. */
export const PLATFORM_CAPABILITIES: string[] = [
  "Docker deployment",
  "Prometheus monitoring",
  "OpenAPI documentation",
  "PostgreSQL persistence",
  "Structured logging",
];
