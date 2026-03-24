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
  blue: "bg-blue-50 text-blue-600 dark:bg-bia-teal/10 dark:text-bia-teal",
  green: "bg-green-50 text-green-600 dark:bg-bia-teal/10 dark:text-bia-teal",
  yellow: "bg-yellow-50 text-yellow-600 dark:bg-[rgba(251,191,36,0.12)] dark:text-[#FBBF24]",
  red: "bg-red-50 text-red-600 dark:bg-[rgba(248,113,113,0.12)] dark:text-[#F87171]",
  purple: "bg-purple-50 text-purple-600 dark:bg-[rgba(129,140,248,0.12)] dark:text-[#818CF8]",
  indigo: "bg-indigo-50 text-indigo-600 dark:bg-[rgba(129,140,248,0.12)] dark:text-[#818CF8]",
};

export default function StatCard({ titulo, valor, subtitulo, icono: Icono, color = "blue", tendencia }: StatCardProps) {
  return (
    <div className="card hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-bia-muted">{titulo}</p>
          <p className="mt-1 sm:mt-2 text-xl sm:text-3xl font-bold text-gray-900 dark:text-white">{valor}</p>
          {subtitulo && <p className="mt-1 text-sm text-gray-500 dark:text-bia-muted">{subtitulo}</p>}
          {tendencia && (
            <p className={`mt-1 text-sm font-medium ${tendencia.positivo ? "text-green-600 dark:text-bia-teal" : "text-red-600 dark:text-[#F87171]"}`}>
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
