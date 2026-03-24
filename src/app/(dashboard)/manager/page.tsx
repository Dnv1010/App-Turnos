"use client";

import { useState, useEffect } from "react";
import { parseResponseJson } from "@/lib/parseFetchJson";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { useTurnosStream } from "@/hooks/useTurnosStream";
import KPICards from "@/components/dashboard/KPICards";
import GraficoHoras from "@/components/dashboard/GraficoHoras";
import DataTable from "@/components/ui/DataTable";
import StatCard from "@/components/ui/StatCard";
import { HiUserGroup, HiOfficeBuilding, HiGlobeAlt } from "react-icons/hi";
import { getZonaLabel } from "@/lib/roleLabels";

interface DetalleUsuario {
  userId: string; nombre: string; zona: string; role: string; totalTurnos: number;
  horasOrdinarias: number; heDiurna: number; heNocturna: number; heDominical: number;
  heNoctDominical: number; totalHorasExtra: number; totalRecargos: number; totalDisponibilidades: number;
}

interface ReporteData {
  detalle: DetalleUsuario[];
  resumen: { totalTecnicos: number; totalHorasExtra: number; totalRecargos: number; totalHorasOrdinarias: number; totalDisponibilidades: number; };
  alertas: Array<{ nombre: string; mensaje: string }>;
}

export default function ManagerPage() {
  const [data, setData] = useState<ReporteData | null>(null);
  const [zonaFilter, setZonaFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  /** Invalida datos cuando SSE notifica cambios (antes se re-disparaba el effect vía `loading` en deps). */
  const [refreshKey, setRefreshKey] = useState(0);

  const ahora = new Date();
  const inicio = format(startOfMonth(ahora), "yyyy-MM-dd");
  const fin = format(endOfMonth(ahora), "yyyy-MM-dd");

  useTurnosStream(
    () => {
      console.log("Turno eliminado, recargando reportes");
      setRefreshKey((k) => k + 1);
    },
    () => {
      console.log("Turno editado, recargando reportes");
      setRefreshKey((k) => k + 1);
    }
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/reportes?inicio=${inicio}&fin=${fin}&zona=${zonaFilter}`);
        const d = await parseResponseJson<ReporteData>(res);
        if (cancelled) return;
        if (res.ok && d && Array.isArray(d.detalle) && d.resumen) setData(d);
        else setData(null);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inicio, fin, zonaFilter, refreshKey]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        setRefreshKey((k) => k + 1);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  if (!data) return null;

  const bogota = data.detalle.filter((d) => d.zona === "BOGOTA");
  const costa = data.detalle.filter((d) => d.zona === "COSTA");
  const interior = data.detalle.filter((d) => d.zona === "INTERIOR");
  const datosGrafico = data.detalle.map((d) => ({ nombre: d.nombre.split(" ")[0], horasOrdinarias: d.horasOrdinarias, heDiurna: d.heDiurna, heNocturna: d.heNocturna, recargos: d.totalRecargos }));

  const columns = [
    { key: "nombre", label: "Operador", sortable: true },
    {
      key: "zona",
      label: "Zona",
      render: (d: DetalleUsuario) => (
        <span
          className={
            d.zona === "BOGOTA"
              ? "badge-blue"
              : d.zona === "INTERIOR"
                ? "badge-zona-interior"
                : "badge-green"
          }
        >
          {getZonaLabel(d.zona)}
        </span>
      ),
    },
    { key: "totalTurnos", label: "Turnos", sortable: true },
    { key: "horasOrdinarias", label: "Ordinarias", sortable: true },
    { key: "totalHorasExtra", label: "HE Total", sortable: true },
    { key: "totalRecargos", label: "Recargos", sortable: true },
    { key: "totalDisponibilidades", label: "Disponib.",
      render: (d: DetalleUsuario) => d.totalDisponibilidades > 0 ? new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(d.totalDisponibilidades) : "—" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h2 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard Global</h2>
          <p className="text-gray-500 dark:text-[#A0AEC0]">{format(ahora, "MMMM yyyy", { locale: es })}</p></div>
        <div className="flex gap-2">
          {(["ALL", "BOGOTA", "COSTA", "INTERIOR"] as const).map((z) => (
            <button key={z} onClick={() => { setZonaFilter(z); setLoading(true); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm dark:shadow-black/30 ${zonaFilter === z ? "bg-primary-600 text-white" : "bg-white dark:bg-[#1A2340] text-gray-600 dark:text-[#A0AEC0] border border-gray-300 dark:border-[#3A4565] hover:bg-gray-50 dark:hover:bg-[#243052]"}`}>
              {z === "ALL" ? "Todas" : getZonaLabel(z)}
            </button>
          ))}
        </div>
      </div>
      {data.alertas.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-2">Alertas ({data.alertas.length})</h4>
          <ul className="space-y-1">{data.alertas.map((a, i) => <li key={i} className="text-sm text-yellow-700 dark:text-yellow-300">⚠ {a.mensaje}</li>)}</ul>
        </div>
      )}
      <KPICards data={{ totalTecnicos: data.resumen.totalTecnicos, horasOrdinarias: data.resumen.totalHorasOrdinarias, totalHorasExtra: data.resumen.totalHorasExtra, totalRecargos: data.resumen.totalRecargos, totalDisponibilidades: data.resumen.totalDisponibilidades }} showTeamMetrics />
      {zonaFilter === "ALL" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard titulo="Zona Bogotá" valor={`${bogota.length} operadores`}
            subtitulo={`${Math.round(bogota.reduce((s, d) => s + d.totalHorasExtra, 0) * 100) / 100}h extras`} icono={HiOfficeBuilding} color="blue" />
          <StatCard titulo="Zona Costa" valor={`${costa.length} operadores`}
            subtitulo={`${Math.round(costa.reduce((s, d) => s + d.totalHorasExtra, 0) * 100) / 100}h extras`} icono={HiUserGroup} color="green" />
          <StatCard titulo="Zona Interior" valor={`${interior.length} operadores`}
            subtitulo={`${Math.round(interior.reduce((s, d) => s + d.totalHorasExtra, 0) * 100) / 100}h extras`} icono={HiGlobeAlt} color="indigo" />
        </div>
      )}
      <GraficoHoras datos={datosGrafico} titulo="Consolidado de Horas" />
      <div><h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Detalle por operador</h3>
        <DataTable columns={columns as never} data={data.detalle as never} searchable searchPlaceholder="Buscar operador..." /></div>
    </div>
  );
}