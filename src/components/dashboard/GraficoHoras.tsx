"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

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
  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{titulo}</h3>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="nombre" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} />
            <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }}
              label={{ value: "Horas", angle: -90, position: "insideLeft", style: { fontSize: 12 } }} />
            <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", boxShadow: "0 4px 6px -1px rgba(0,0,0,.1)" }} />
            <Legend />
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
