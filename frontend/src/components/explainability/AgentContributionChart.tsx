import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { agentDisplayName, type AgentContribution } from "../../lib/justification";

/**
 * Item 5 (agent contribution visualization) - one bar per agent for
 * its raw risk (0-100) plus a second bar for confidence (0-1, scaled
 * to the same axis as a percentage) so both numbers Fusion actually
 * consumed (see build_agent_contributions in justification.py) are
 * visible side by side. Renders exactly what the backend persisted;
 * it does not recompute or weight anything.
 */
export function AgentContributionChart({
  contributions,
}: {
  contributions: Record<string, AgentContribution>;
}) {
  const data = Object.entries(contributions).map(([agentName, contribution]) => ({
    agent: agentDisplayName(agentName),
    risk: contribution.risk,
    confidencePct: contribution.confidence * 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="agent" />
        <YAxis domain={[0, 100]} />
        <Tooltip
          formatter={(value: unknown) => (typeof value === "number" ? value.toFixed(1) : String(value))}
        />
        <Legend />
        <Bar dataKey="risk" name="Raw risk" fill="#ff7f0e" />
        <Bar dataKey="confidencePct" name="Confidence (%)" fill="#4c7bd6" />
      </BarChart>
    </ResponsiveContainer>
  );
}
