import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

/** Human-readable label for each feature identifier
 * `matching_and_differing_features` (src/historical/similarity.py) can
 * return - never a new computation, just a display name for the exact
 * strings the backend already returns. */
const FEATURE_LABELS: Record<string, string> = {
  gas_risk: "Gas risk",
  equipment_risk: "Equipment risk",
  worker_risk: "Worker risk",
  permit_risk: "Permit risk",
  compound_risk_score: "Compound score",
  operational_status: "Operational status",
  interaction_bonus: "Interaction bonus",
  "triggered:gas_risk": "Gas agent triggered",
  "triggered:equipment_status": "Equipment agent triggered",
  "triggered:worker_exposure": "Worker agent triggered",
  "triggered:permit_intelligence": "Permit agent triggered",
};

function featureLabel(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature;
}

/**
 * M24 Part 10 (similarity radar) - one polygon per match, one axis per
 * feature the backend actually compared. Axis value is binary (1 =
 * matched within tolerance / same category, 0 = differed) - exactly
 * `matching_features`/`differing_features` from `IncidentMatch`,
 * rendered radially instead of as two text lists. Never a fabricated
 * magnitude: this platform's API does not expose raw feature values
 * for a historical tick, only the already-computed agreement/disagreement.
 */
export function SimilarityRadar({
  matchingFeatures,
  differingFeatures,
}: {
  matchingFeatures: string[];
  differingFeatures: string[];
}) {
  const data = [
    ...matchingFeatures.map((feature) => ({ feature: featureLabel(feature), agreement: 1 })),
    ...differingFeatures.map((feature) => ({ feature: featureLabel(feature), agreement: 0 })),
  ];

  if (data.length === 0) {
    return <p className="kpi-sub">No comparable features for this match.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey="feature" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
        <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
        <Radar
          name="Agreement"
          dataKey="agreement"
          stroke="#4c7bd6"
          fill="#4c7bd6"
          fillOpacity={0.35}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
