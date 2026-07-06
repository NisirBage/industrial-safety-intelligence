import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { RiskAssessment } from "../../api/types";
import { formatTimestamp } from "../../lib/format";

/** Cited (not proposed) tier thresholds - Technical Review Section
 * 5.6 / `docs/architecture/integration_readiness.md`'s "Known
 * calibration parameters" table - drawn as reference lines so the
 * chart shows tier status at a glance, not just a bare number. */
const TIER_THRESHOLDS: { value: number; label: string; color: string }[] = [
  { value: 40, label: "Watch", color: "var(--tier-watch)" },
  { value: 65, label: "Elevated", color: "var(--tier-elevated)" },
  { value: 85, label: "Critical", color: "var(--tier-critical)" },
];

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
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chronological} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={formatTimestamp}
          minTickGap={40}
          tick={{ fontSize: 12, fill: "var(--text-muted)" }}
          label={{ value: "Time", position: "insideBottom", offset: -4, fontSize: 12, fill: "var(--text-muted)" }}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 12, fill: "var(--text-muted)" }}
          label={{
            value: "Overall Plant Risk",
            angle: -90,
            position: "insideLeft",
            fontSize: 12,
            fill: "var(--text-muted)",
          }}
        />
        {TIER_THRESHOLDS.map((threshold) => (
          <ReferenceLine
            key={threshold.label}
            y={threshold.value}
            stroke={threshold.color}
            strokeDasharray="4 4"
            strokeOpacity={0.6}
            label={{ value: threshold.label, position: "right", fontSize: 10, fill: threshold.color }}
          />
        ))}
        <Tooltip
          contentStyle={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: 13,
          }}
          labelFormatter={(label: unknown) => formatTimestamp(String(label))}
          formatter={(value: unknown) =>
            typeof value === "number"
              ? [value.toFixed(2), "Overall plant risk"]
              : [String(value), "Overall plant risk"]
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
