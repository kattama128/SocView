import { Box, Typography, useTheme } from "@mui/material";
import { ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";

type Props = {
  matrix: number[][];
};

type HeatmapPoint = {
  hour: number;
  day: number;
  count: number;
};

const dayLabels = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function buildPoints(matrix: number[][]): HeatmapPoint[] {
  const points: HeatmapPoint[] = [];
  matrix.forEach((row, dayIndex) => {
    row.forEach((count, hour) => {
      points.push({ day: dayIndex, hour, count });
    });
  });
  return points;
}

function getCellColor(count: number, max: number): string {
  if (max <= 0 || count <= 0) {
    return "rgba(148,163,184,0.12)";
  }
  const ratio = count / max;
  if (ratio > 0.75) return "#b91c1c";
  if (ratio > 0.5) return "#ea580c";
  if (ratio > 0.25) return "#f59e0b";
  return "#22c55e";
}

export default function Heatmap({ matrix }: Props) {
  const theme = useTheme();
  const points = buildPoints(matrix);
  const maxCount = Math.max(...points.map((point) => point.count), 0);

  return (
    <Box sx={{ width: "100%", height: 340 }}>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <XAxis
            type="number"
            dataKey="hour"
            domain={[0, 23]}
            tickCount={24}
            tick={{ fill: theme.palette.text.secondary, fontSize: 10 }}
          />
          <YAxis
            type="number"
            dataKey="day"
            domain={[0, 6]}
            ticks={[0, 1, 2, 3, 4, 5, 6]}
            tickFormatter={(value) => dayLabels[value] ?? ""}
            tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
          />
          <ZAxis type="number" dataKey="count" range={[80, 80]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            formatter={(value) => [`${value}`, "Alert"]}
            labelFormatter={(_, payload) => {
              const point = payload && payload[0] ? (payload[0].payload as HeatmapPoint) : null;
              if (!point) return "";
              return `${dayLabels[point.day]} - ${String(point.hour).padStart(2, "0")}:00`;
            }}
          />
          <Scatter
            data={points}
            shape={(props) => {
              const { cx, cy, payload } = props as { cx: number; cy: number; payload: HeatmapPoint };
              return (
                <rect
                  x={cx - 8}
                  y={cy - 8}
                  width={16}
                  height={16}
                  rx={3}
                  fill={getCellColor(payload.count, maxCount)}
                  stroke="rgba(15,23,42,0.2)"
                  strokeWidth={1}
                />
              );
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>
      <Typography variant="caption" color="text.secondary">
        Intensità colore proporzionale al volume alert per fascia oraria.
      </Typography>
    </Box>
  );
}
