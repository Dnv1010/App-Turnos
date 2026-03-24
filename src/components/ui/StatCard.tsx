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
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  green: "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  yellow: "bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400",
  red: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  purple: "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400",
};

export default function StatCard({ titulo, valor, subtitulo, icono: Icono, color = "blue", tendencia }: StatCardProps) {
  return (
    <div className="card hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">{titulo}</p>
          <p className="mt-1 sm:mt-2 text-xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">{valor}</p>
          {subtitulo && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitulo}</p>}
          {tendencia && (
            <p className={`mt-1 text-sm font-medium ${tendencia.positivo ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
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
