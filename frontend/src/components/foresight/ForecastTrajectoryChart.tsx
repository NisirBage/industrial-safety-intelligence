import {
  Area,
  CartesianGrid,
  Line,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ForecastPoint } from "../../api/types";

interface ChartPoint {
  minutes: number;
  actualRisk?: number;
  projectedRisk?: number;
  band?: [number, number];
}

function buildChartData(
  currentTimeline: { timestamp: string; risk: number }[],
  nowTimestamp: string,
  forecast: ForecastPoint[],
): ChartPoint[] {
  const nowMs = new Date(nowTimestamp).getTime();
  const actualPoints: ChartPoint[] = currentTimeline.map((tick) => ({
    minutes: Math.round((new Date(tick.timestamp).getTime() - nowMs) / 60000),
    actualRisk: tick.risk,
  }));

  const lastActual = actualPoints[actualPoints.length - 1];
  if (lastActual && lastActual.minutes === 0) {
    // Connects the dashed projected line to the solid actual line at
    // "now" rather than leaving a visual gap - both fields share the
    // exact same real value, nothing is invented at this point.
    lastActual.projectedRisk = lastActual.actualRisk;
  }

  const projectedPoints: ChartPoint[] = forecast
    .filter((point) => point.projected_risk !== null)
    .map((point) => {
      const observedValues = point.evidence.map((item) => item.observed_risk);
      return {
        minutes: point.horizon_minutes,
        projectedRisk: point.projected_risk as number,
        band:
          observedValues.length > 1
            ? ([Math.min(...observedValues), Math.max(...observedValues)] as [number, number])
            : undefined,
      };
    });

  return [...actualPoints, ...projectedPoints];
}

/**
 * M25 Part 9 (Trajectory graph + Confidence band) - the current
 * replay's own real trailing observations (solid line) next to the
 * historical-analogy forecast (dashed line, distinct color). Per
 * `docs/design/design_system.md`'s standing rule that charts must
 * "not interpolate, not smooth, not predict" real data: the solid
 * "Actual" series is untouched persisted history; the dashed
 * "Projected" series is visually and textually distinct so it can
 * never be mistaken for a measured value. The shaded band is not a
 * fabricated statistical confidence interval - it is the real min/max
 * spread of what the matched historical incidents actually did at
 * that horizon, so it widens exactly when those incidents disagreed
 * and narrows when they agreed.
 */
export function ForecastTrajectoryChart({
  currentTimeline,
  nowTimestamp,
  forecast,
}: {
  currentTimeline: { timestamp: string; risk: number }[];
  nowTimestamp: string;
  forecast: ForecastPoint[];
}) {
  const data = buildChartData(currentTimeline, nowTimestamp, forecast);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="minutes"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(value: number) => (value === 0 ? "Now" : `${value > 0 ? "+" : ""}${value}m`)}
          tick={{ fontSize: 12, fill: "var(--text-muted)" }}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 12, fill: "var(--text-muted)" }}
          label={{
            value: "Compound Risk",
            angle: -90,
            position: "insideLeft",
            fontSize: 12,
            fill: "var(--text-muted)",
          }}
        />
        <ReferenceLine
          x={0}
          stroke="var(--text-muted)"
          strokeDasharray="2 2"
          label={{ value: "Now", position: "top", fontSize: 11, fill: "var(--text-muted)" }}
        />
        <Tooltip
          contentStyle={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: 13,
          }}
          labelFormatter={(value: unknown) => {
            const minutes = Number(value);
            return minutes === 0 ? "Now" : minutes > 0 ? `+${minutes} min (projected)` : `${minutes} min`;
          }}
          formatter={(value: unknown, name: unknown) => {
            const label = name === undefined ? "" : String(name);
            return typeof value === "number" ? [value.toFixed(1), label] : [String(value), label];
          }}
        />
        <Area
          dataKey="band"
          name="Historical spread"
          fill="var(--tier-elevated)"
          fillOpacity={0.12}
          stroke="none"
          isAnimationActive={false}
        />
        <Line
          type="linear"
          dataKey="actualRisk"
          name="Actual"
          stroke="#ff7f0e"
          dot={{ r: 3 }}
          isAnimationActive={false}
        />
        <Line
          type="linear"
          dataKey="projectedRisk"
          name="Projected (historical evidence)"
          stroke="#4c7bd6"
          strokeDasharray="6 4"
          dot={{ r: 3 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
