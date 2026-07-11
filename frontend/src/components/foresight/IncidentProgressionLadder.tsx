import type { IncidentProgression, ProgressionStage } from "../../api/types";

function Rung({ title, stage }: { title: string; stage: ProgressionStage }) {
  return (
    <li className="foresight-progression-rung">
      <span className="foresight-progression-rung-title">{title}</span>
      <span className={`foresight-progression-rung-label${stage.tier ? ` tier-${stage.tier}` : ""}`}>
        {stage.label}
      </span>
      <p className="kpi-sub">{stage.evidence}</p>
    </li>
  );
}

/**
 * M25 Part 6/9 (Incident Progression, displayed as a ladder) - Current
 * Stage -> Likely Next -> Likely Following -> Expected Resolution,
 * every rung derived from the real tier sequences of matched
 * historical trajectories (src/foresight/progression.py). Never a
 * recommendation - each rung states its own supporting evidence.
 */
export function IncidentProgressionLadder({ progression }: { progression: IncidentProgression }) {
  return (
    <ol className="foresight-progression-ladder">
      <Rung title="Current Stage" stage={progression.current_stage} />
      <Rung title="Likely Next Stage" stage={progression.likely_next_stage} />
      <Rung title="Likely Following Stage" stage={progression.likely_following_stage} />
      <Rung title="Expected Resolution" stage={progression.expected_resolution} />
    </ol>
  );
}
