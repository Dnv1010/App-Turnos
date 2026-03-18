"use client";

import { IconType } from "react-icons";

interface StatCardProps {
  titulo: string;
  valor: string | number;
  subtitulo?: string;
  icono: IconType;
  color?: "blue" | "green" | "yellow" | "red" | "purple" | "indigo";
  tendencia?: { valor: number; positivo: boolean };
}

const colorClasses = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-green-50 text-green-600",
  yellow: "bg-yellow-50 text-yellow-600",
  red: "bg-red-50 text-red-600",
  purple: "bg-purple-50 text-purple-600",
  indigo: "bg-indigo-50 text-indigo-600",
};

export default function StatCard({ titulo, valor, subtitulo, icono: Icono, color = "blue", tendencia }: StatCardProps) {
  return (
    <div className="card hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs sm:text-sm font-medium text-gray-500">{titulo}</p>
          <p className="mt-1 sm:mt-2 text-xl sm:text-3xl font-bold text-gray-900">{valor}</p>
          {subtitulo && <p className="mt-1 text-sm text-gray-500">{subtitulo}</p>}
          {tendencia && (
            <p className={`mt-1 text-sm font-medium ${tendencia.positivo ? "text-green-600" : "text-red-600"}`}>
              {tendencia.positivo ? "↑" : "↓"} {tendencia.valor}%
            </p>
          )}
        </div>
        <div className={`p-3 rounded-xl ${colorClasses[color]}`}>
          <Icono className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}
