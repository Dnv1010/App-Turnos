"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useTheme } from "@/hooks/useTheme";

interface DatoGrafico {
  nombre: string;
  horasOrdinarias: number;
  heDiurna: number;
  heNocturna: number;
  recargos: number;
}

interface GraficoHorasProps {
  datos: DatoGrafico[];
  titulo?: string;
}

export default function GraficoHoras({ datos, titulo = "Horas por operador" }: GraficoHorasProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const chartColors = isDark
    ? { grid: "#2A3555", axis: "#A0AEC0", primary: "#00D4AA", secondary: "#818CF8" }
    : { grid: "#E5E7EB", axis: "#6B7280", primary: "#2563EB", secondary: "#7C3AED" };

  const tooltipBg = isDark ? "#1A2340" : "#ffffff";
  const tooltipBorder = isDark ? "#2A3555" : "#e5e7eb";
  const tooltipLabel = isDark ? "#FFFFFF" : "#111827";

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{titulo}</h3>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
            <XAxis
              dataKey="nombre"
              tick={{ fontSize: 12, fill: chartColors.axis }}
              tickLine={false}
              axisLine={{ stroke: chartColors.grid }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: chartColors.axis }}
              tickLine={false}
              axisLine={{ stroke: chartColors.grid }}
              label={{
                value: "Horas",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 12, fill: chartColors.axis },
              }}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "8px",
                border: `1px solid ${tooltipBorder}`,
                boxShadow: "0 4px 6px -1px rgba(0,0,0,.25)",
                backgroundColor: tooltipBg,
                color: tooltipLabel,
              }}
              labelStyle={{ color: tooltipLabel }}
            />
            <Legend wrapperStyle={{ color: chartColors.axis }} />
            <Bar dataKey="horasOrdinarias" name="Ordinarias" fill={chartColors.primary} radius={[2, 2, 0, 0]} />
            <Bar dataKey="heDiurna" name="HE Diurna" fill={isDark ? "#34D399" : "#10b981"} radius={[2, 2, 0, 0]} />
            <Bar dataKey="heNocturna" name="HE Nocturna" fill={chartColors.secondary} radius={[2, 2, 0, 0]} />
            <Bar dataKey="recargos" name="Recargos" fill={isDark ? "#FBBF24" : "#f59e0b"} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
