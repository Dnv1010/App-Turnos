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

export default function GraficoHoras({ datos, titulo = "Horas por Técnico" }: GraficoHorasProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const axisColor = isDark ? "#9CA3AF" : "#6B7280";
  const gridColor = isDark ? "#374151" : "#E5E7EB";
  const tooltipBg = isDark ? "#1F2937" : "#ffffff";
  const tooltipBorder = isDark ? "#4B5563" : "#e5e7eb";
  const tooltipLabel = isDark ? "#F3F4F6" : "#111827";

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{titulo}</h3>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="nombre"
              tick={{ fontSize: 12, fill: axisColor }}
              tickLine={false}
              axisLine={{ stroke: gridColor }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: axisColor }}
              tickLine={false}
              axisLine={{ stroke: gridColor }}
              label={{
                value: "Horas",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 12, fill: axisColor },
              }}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "8px",
                border: `1px solid ${tooltipBorder}`,
                boxShadow: "0 4px 6px -1px rgba(0,0,0,.1)",
                backgroundColor: tooltipBg,
                color: tooltipLabel,
              }}
              labelStyle={{ color: tooltipLabel }}
            />
            <Legend wrapperStyle={{ color: axisColor }} />
            <Bar dataKey="horasOrdinarias" name="Ordinarias" fill="#3b82f6" radius={[2, 2, 0, 0]} />
            <Bar dataKey="heDiurna" name="HE Diurna" fill="#10b981" radius={[2, 2, 0, 0]} />
            <Bar dataKey="heNocturna" name="HE Nocturna" fill="#6366f1" radius={[2, 2, 0, 0]} />
            <Bar dataKey="recargos" name="Recargos" fill="#f59e0b" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
