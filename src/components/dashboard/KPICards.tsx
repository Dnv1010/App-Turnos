"use client";

import StatCard from "@/components/ui/StatCard";
import { HiClock, HiUsers, HiTrendingUp, HiCurrencyDollar, HiMoon } from "react-icons/hi";

interface KPIData {
  totalTecnicos?: number;
  horasOrdinarias: number;
  totalHorasExtra: number;
  totalRecargos: number;
  totalDisponibilidades?: number;
  heDiurna?: number;
  heNocturna?: number;
}

interface KPICardsProps {
  data: KPIData;
  showTeamMetrics?: boolean;
}

export default function KPICards({ data, showTeamMetrics = false }: KPICardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {showTeamMetrics && data.totalTecnicos !== undefined && (
        <StatCard titulo="Técnicos Activos" valor={data.totalTecnicos} icono={HiUsers} color="indigo" />
      )}
      <StatCard titulo="Horas Ordinarias" valor={`${data.horasOrdinarias}h`} icono={HiClock} color="blue" />
      <StatCard titulo="Horas Extra" valor={`${data.totalHorasExtra}h`}
        subtitulo={data.heDiurna !== undefined ? `Diurna: ${data.heDiurna}h | Nocturna: ${data.heNocturna}h` : undefined}
        icono={HiTrendingUp} color="green" />
      <StatCard titulo="Recargos" valor={`${data.totalRecargos}h`} icono={HiMoon} color="purple" />
      {data.totalDisponibilidades !== undefined && data.totalDisponibilidades > 0 && (
        <StatCard titulo="Disponibilidades"
          valor={new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(data.totalDisponibilidades)}
          icono={HiCurrencyDollar} color="yellow" />
      )}
    </div>
  );
}
