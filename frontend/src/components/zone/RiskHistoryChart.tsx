import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { RiskAssessment } from "../../api/types";
import { formatTimestamp } from "../../lib/format";

/**
 * Renders exactly what the backend returned - oldest to newest,
 * straight line segments between real data points
 * (`type="linear"`, never `"monotone"` or a spline, which would
 * interpolate/smooth values the backend never produced). M8's own
 * requirement: "Do not interpolate. Do not smooth. Do not predict."
 */
export function RiskHistoryChart({ history }: { history: RiskAssessment[] }) {
  const chronological = [...history].reverse();

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chronological}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="timestamp" tickFormatter={formatTimestamp} minTickGap={40} />
        <YAxis domain={[0, 100]} />
        <Tooltip
          labelFormatter={(label: unknown) => formatTimestamp(String(label))}
          formatter={(value: unknown) =>
            typeof value === "number" ? value.toFixed(2) : String(value)
          }
        />
        <Line
          type="linear"
          dataKey="compound_risk_score"
          stroke="#ff7f0e"
          dot={{ r: 3 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
