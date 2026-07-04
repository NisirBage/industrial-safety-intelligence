import { Line, LineChart, ResponsiveContainer } from "recharts";

/** No axes, no grid, no tooltip - a glance-only trend indicator over
 * already-persisted values, oldest to newest, straight line segments
 * only (same "never interpolate" rule as `RiskHistoryChart`). */
export function MiniSparkline({ values }: { values: number[] }) {
  const data = values.map((value, index) => ({ index, value }));
  return (
    <ResponsiveContainer width="100%" height={36}>
      <LineChart data={data}>
        <Line
          type="linear"
          dataKey="value"
          stroke="#ff7f0e"
          dot={false}
          strokeWidth={2}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
