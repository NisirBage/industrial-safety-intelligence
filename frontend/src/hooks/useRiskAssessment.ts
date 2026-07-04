import { useQuery } from "@tanstack/react-query";

import { getRiskAssessment } from "../api/risk";

/** One persisted assessment by id - backs the explainability and
 * research-mode deep links. A historical record, not live-polled. */
export function useRiskAssessment(assessmentId: string | undefined) {
  return useQuery({
    queryKey: ["risk", "assessment", assessmentId],
    queryFn: () => getRiskAssessment(assessmentId as string),
    enabled: assessmentId !== undefined,
  });
}
