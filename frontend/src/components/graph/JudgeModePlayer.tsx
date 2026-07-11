import { useEffect, useMemo, useState } from "react";

import type { GraphEntity } from "../../api/types";
import { useGraphNeighbors } from "../../hooks/useGraphNeighbors";
import { buildJudgeModeSteps, judgeModeEdgeId } from "../../lib/judgeModePath";
import { QueryResult } from "../common/QueryResult";

const STEP_INTERVAL_MS = 2200;

/**
 * M26 Part 13 (Judge Mode) - "Explain This Decision": steps through
 * the real Sensor -> Agent -> Risk -> Historical Match -> Forecast ->
 * Recommendation chain for one Risk Assessment, highlighting one real
 * edge at a time via `onHighlightEdges`. Sourced from two one-hop
 * neighbor calls only - no new computation, no fabricated ordering
 * beyond what `buildJudgeModeSteps` documents.
 */
export function JudgeModePlayer({
  assessment,
  onHighlightEdges,
  onFocusEntity,
}: {
  assessment: GraphEntity;
  onHighlightEdges: (edgeIds: Set<string>) => void;
  onFocusEntity: (entity: GraphEntity) => void;
}) {
  const assessmentNeighborsQuery = useGraphNeighbors(assessment.kind, assessment.id);
  const triggeredAgent = assessmentNeighborsQuery.data?.neighbors.find(
    (n) => n.edge.relation === "triggered" && n.entity.kind === "triggered_agent",
  );
  const agentNeighborsQuery = useGraphNeighbors(
    triggeredAgent?.entity.kind,
    triggeredAgent?.entity.id,
  );

  const steps = useMemo(
    () =>
      assessmentNeighborsQuery.data
        ? buildJudgeModeSteps(
            assessment,
            assessmentNeighborsQuery.data.neighbors,
            agentNeighborsQuery.data?.neighbors ?? [],
          )
        : [],
    [assessment, assessmentNeighborsQuery.data, agentNeighborsQuery.data],
  );

  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    setStepIndex(0);
    setIsPlaying(false);
  }, [assessment.kind, assessment.id]);

  useEffect(() => {
    if (!isPlaying || steps.length === 0 || stepIndex >= steps.length - 1) {
      if (isPlaying && steps.length > 0 && stepIndex >= steps.length - 1) {
        setIsPlaying(false);
      }
      return;
    }
    const timer = setTimeout(() => setStepIndex((i) => i + 1), STEP_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [isPlaying, stepIndex, steps.length]);

  useEffect(() => {
    const edgeIds = new Set(
      steps
        .slice(0, stepIndex + 1)
        .flatMap((step) => (step.edge ? [judgeModeEdgeId(step.edge)] : [])),
    );
    onHighlightEdges(edgeIds);
    const current = steps[stepIndex];
    if (current) {
      onFocusEntity(current.entity);
    }
    // onHighlightEdges/onFocusEntity are stable callbacks from the parent page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, stepIndex]);

  return (
    <div className="graph-judge-mode">
      <h4>Explain This Decision</h4>
      <QueryResult
        isLoading={assessmentNeighborsQuery.isLoading}
        error={assessmentNeighborsQuery.error}
        isEmpty={!assessmentNeighborsQuery.isLoading && steps.length === 0}
        emptyLabel="No explainable chain found for this assessment."
      >
        <ol className="graph-judge-mode-steps">
          {steps.map((step, index) => (
            <li
              key={`${step.entity.kind}:${step.entity.id}`}
              className={index === stepIndex ? "graph-judge-mode-step-active" : ""}
            >
              <button type="button" onClick={() => setStepIndex(index)}>
                <span className="graph-judge-mode-step-label">{step.label}</span>
                <span className="graph-judge-mode-step-entity">{step.entity.label}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="graph-judge-mode-controls">
          <button
            type="button"
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            disabled={stepIndex === 0}
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            disabled={steps.length === 0 || stepIndex >= steps.length - 1}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}
            disabled={stepIndex >= steps.length - 1}
          >
            Next
          </button>
        </div>
      </QueryResult>
    </div>
  );
}
