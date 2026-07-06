import { useState } from "react";

import type { RiskAssessment } from "../../api/types";
import { formatTimestamp } from "../../lib/format";
import { agentDisplayName, type RiskJustification } from "../../lib/justification";
import { agentStage, groupRulesByStage, type PipelineStage } from "../../lib/pipelineStages";
import {
  hasInteractionBonus,
  isIgnoredByThresholdEngine,
  rankContributingFactors,
} from "../../lib/rootCause";

type StageId =
  | "sensors"
  | "context_builders"
  | `agent_${string}`
  | "fusion"
  | "tiering"
  | "explainability"
  | "recommendations";

interface StageDetail {
  input: string;
  output: string;
  contribution?: string;
  confidence?: string;
  /** Which of this tick's own persisted `rules_fired` entries pertain
   * to this stage (matched by keyword against the rule identifier
   * itself, e.g. "fusion" stage <-> rules containing "fusion" or
   * "interaction_bonus") - real, already-persisted facts, never a
   * fabricated explanation. */
  evidence?: string;
  /** The tick this whole stage's numbers came from - the same
   * `assessment.timestamp` every other stage shares, since a
   * `RiskAssessment` row is the unit of "one moment in time" this
   * platform persists. */
  sourceTimestamp: string;
}

/**
 * Item 4 (animated pipeline visualization) - Sensors -> Context
 * Builders -> the four agents -> Fusion -> Tiering -> Explainability
 * -> Recommendations, as a clickable diagram. Every number shown for
 * a stage this project's API actually exposes (the four agents'
 * `risk`/`confidence`, Fusion's compound score and interaction bonus,
 * Tiering's before/after tier) comes straight from the persisted
 * `justification` - never recomputed. Sensors and Context Builders
 * have no separately-exposed per-tick output in this API, so their
 * detail panel describes what they do rather than inventing a number.
 */
export function PipelineDiagram({
  assessment,
  justification,
}: {
  assessment: RiskAssessment;
  justification: RiskJustification | null;
}) {
  const [selected, setSelected] = useState<StageId | null>(null);
  /** Item 5 (Counterfactual Overlay) - self-contained per diagram
   * instance so every caller (Research Mode, Scenario Replay, Time
   * Machine) gets the toggle for free. When on, highlights which
   * agent nodes the naive threshold engine structurally never reads,
   * which node this tick's escalation actually traces to (the
   * top-ranked contributing agent by persisted risk), and Fusion when
   * an interaction bonus was actually applied - every highlight a pure
   * derivation over already-persisted `justification` fields, nothing
   * recomputed. */
  const [showCounterfactualOverlay, setShowCounterfactualOverlay] = useState(false);
  /** Item 6 (Influence Paths) - a one-shot, staggered highlight
   * through the real causal chain this tick's own data implies:
   * Sensors -> Context Builders -> the top-ranked contributing agent
   * -> Fusion -> Tiering -> Recommendations. Purely a CSS animation
   * timing concern; the path itself is the same `topFactorAgentName`
   * the counterfactual overlay already computes. */
  const [tracingPath, setTracingPath] = useState(false);

  const agentEntries = justification ? Object.entries(justification.agentContributions) : [];
  const rankedFactors = rankContributingFactors(justification);
  const topFactorAgentName = rankedFactors[0]?.agentName;
  const bonusApplied = hasInteractionBonus(justification);
  const rulesByStage = justification ? groupRulesByStage(justification.rulesFired) : [];

  function evidenceFor(stage: PipelineStage): string | undefined {
    const rules = rulesByStage.find((entry) => entry.stage === stage)?.rules;
    return rules && rules.length > 0 ? rules.join(", ") : undefined;
  }

  const details: Record<StageId, StageDetail> = {
    sensors: {
      input: "Real-world gas/permit/equipment/worker-location readings for this zone.",
      output: "Raw readings persisted to the database - not computed here.",
      sourceTimestamp: assessment.timestamp,
    },
    context_builders: {
      input: "Repository queries (sensor readings, permits, worker locations, equipment status).",
      output: "One assembled AgentInput per agent below - assembly only, no risk computed.",
      sourceTimestamp: assessment.timestamp,
    },
    fusion: {
      input: `${agentEntries.length} agent outputs above.`,
      output: `Overall plant risk: ${assessment.compound_risk_score.toFixed(2)}`,
      contribution: justification
        ? `Interaction bonus applied: ${justification.interactionBonusApplied.toFixed(2)}`
        : undefined,
      evidence: evidenceFor("Fusion"),
      sourceTimestamp: assessment.timestamp,
    },
    tiering: {
      input: `Overall plant risk ${assessment.compound_risk_score.toFixed(2)}.`,
      output: justification
        ? `${justification.tierBefore} → ${justification.tierAfter}`
        : assessment.tier,
      evidence: evidenceFor("Tiering"),
      sourceTimestamp: assessment.timestamp,
    },
    explainability: {
      input: "Every agent's and Fusion's own fired rules, plus the tier transition.",
      output: justification ? `${justification.rulesFired.length} rules fired this tick.` : "n/a",
      sourceTimestamp: assessment.timestamp,
    },
    recommendations: {
      input: "This tick's tier and fired rules.",
      output: "Canned action phrases looked up from tier/rule identifiers - no new computation.",
      sourceTimestamp: assessment.timestamp,
    },
  };

  for (const [agentName, contribution] of agentEntries) {
    details[`agent_${agentName}`] = {
      input: "Its own AgentInput, assembled by the Context Builder stage above.",
      output: `Raw risk: ${contribution.risk.toFixed(2)}`,
      confidence: `Confidence: ${contribution.confidence.toFixed(2)}`,
      evidence: evidenceFor(agentStage(agentName)),
      sourceTimestamp: assessment.timestamp,
    };
  }

  /** Item 5 (Counterfactual Overlay) - which class (if any) marks this
   * node under the overlay, derived purely from already-computed
   * facts: the fixed set of agents the threshold engine never reads,
   * this tick's top-ranked contributing agent, and whether Fusion
   * actually applied an interaction bonus. */
  function overlayClassFor(id: StageId): string {
    if (!showCounterfactualOverlay) {
      return "";
    }
    if (id.startsWith("agent_")) {
      const agentName = id.slice("agent_".length);
      const classes: string[] = [];
      if (isIgnoredByThresholdEngine(agentName)) {
        classes.push("pipeline-stage-ignored-by-threshold");
      }
      if (agentName === topFactorAgentName) {
        classes.push("pipeline-stage-escalation-source");
      }
      return classes.join(" ");
    }
    if (id === "fusion" && bonusApplied) {
      return "pipeline-stage-bonus-source";
    }
    return "";
  }

  const influencePath: StageId[] = [
    "sensors",
    "context_builders",
    ...(topFactorAgentName ? ([`agent_${topFactorAgentName}`] as StageId[]) : []),
    "fusion",
    "tiering",
    "recommendations",
  ];

  function Stage({ id, label }: { id: StageId; label: string }) {
    const isActive = agentEntries.length > 0 || id === "sensors" || id === "context_builders";
    const traceIndex = tracingPath ? influencePath.indexOf(id) : -1;
    return (
      <button
        type="button"
        className={`pipeline-stage ${selected === id ? "pipeline-stage-selected" : ""} ${
          isActive ? "pipeline-stage-active" : ""
        } ${overlayClassFor(id)} ${traceIndex >= 0 ? "pipeline-stage-tracing" : ""}`}
        style={traceIndex >= 0 ? { animationDelay: `${traceIndex * 0.4}s` } : undefined}
        onClick={() => setSelected((current) => (current === id ? null : id))}
        title={label}
      >
        {label}
      </button>
    );
  }

  const activeDetail = selected ? details[selected] : null;

  return (
    <div className="pipeline-diagram">
      <label className="pipeline-overlay-toggle">
        <input
          type="checkbox"
          checked={showCounterfactualOverlay}
          onChange={(event) => setShowCounterfactualOverlay(event.target.checked)}
        />
        Show alternative decision overlay
      </label>{" "}
      <button
        type="button"
        disabled={tracingPath}
        onClick={() => {
          setTracingPath(true);
          window.setTimeout(() => setTracingPath(false), influencePath.length * 400 + 600);
        }}
      >
        {tracingPath ? "Tracing…" : "Trace influence path"}
      </button>
      {showCounterfactualOverlay && (
        <ul className="pipeline-overlay-legend">
          <li className="pipeline-overlay-legend-ignored">Ignored by the naive threshold engine</li>
          <li className="pipeline-overlay-legend-escalation">This tick&apos;s top contributing factor</li>
          <li className="pipeline-overlay-legend-bonus">Interaction bonus applied here</li>
        </ul>
      )}
      <div className="pipeline-row">
        <Stage id="sensors" label="Sensors" />
        <span className="pipeline-arrow">&rarr;</span>
        <Stage id="context_builders" label="Context Builders" />
        <span className="pipeline-arrow">&rarr;</span>
        <div className="pipeline-agent-group">
          {agentEntries.length > 0 ? (
            agentEntries.map(([agentName]) => (
              <Stage
                key={agentName}
                id={`agent_${agentName}`}
                label={agentDisplayName(agentName)}
              />
            ))
          ) : (
            <Stage id="agent_unknown" label="Agents" />
          )}
        </div>
        <span className="pipeline-arrow">&rarr;</span>
        <Stage id="fusion" label="Fusion" />
        <span className="pipeline-arrow">&rarr;</span>
        <Stage id="tiering" label="Tiering" />
        <span className="pipeline-arrow">&rarr;</span>
        <Stage id="explainability" label="Explainability" />
        <span className="pipeline-arrow">&rarr;</span>
        <Stage id="recommendations" label="Recommendations" />
      </div>

      {activeDetail && (
        <div className="pipeline-detail card">
          <p>
            <strong>Input:</strong> {activeDetail.input}
          </p>
          <p>
            <strong>Output:</strong> {activeDetail.output}
          </p>
          {activeDetail.contribution && (
            <p>
              <strong>Contribution:</strong> {activeDetail.contribution}
            </p>
          )}
          {activeDetail.confidence && (
            <p>
              <strong>Confidence:</strong> {activeDetail.confidence}
            </p>
          )}
          {activeDetail.evidence && (
            <p>
              <strong>Evidence:</strong> {activeDetail.evidence}
            </p>
          )}
          <p>
            <strong>Source timestamp:</strong> {formatTimestamp(activeDetail.sourceTimestamp)}
          </p>
        </div>
      )}
    </div>
  );
}
