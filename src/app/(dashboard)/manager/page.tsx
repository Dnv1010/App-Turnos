"use client";

import { useState, useEffect } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { useTurnosStream } from "@/hooks/useTurnosStream";
import KPICards from "@/components/dashboard/KPICards";
import GraficoHoras from "@/components/dashboard/GraficoHoras";
import DataTable from "@/components/ui/DataTable";
import StatCard from "@/components/ui/StatCard";
import { HiUserGroup, HiOfficeBuilding } from "react-icons/hi";

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

  const ahora = new Date();
  const inicio = format(startOfMonth(ahora), "yyyy-MM-dd");
  const fin = format(endOfMonth(ahora), "yyyy-MM-dd");

  useTurnosStream(
    (data) => {
      console.log("Turno eliminado, recargando reportes");
      setLoading(true);
    },
    (data) => {
      console.log("Turno editado, recargando reportes");
      setLoading(true);
    }
  );

  useEffect(() => {
    fetch(`/api/reportes?inicio=${inicio}&fin=${fin}&zona=${zonaFilter}`)
      .then((r) => r.json()).then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [inicio, fin, zonaFilter, loading]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  if (!data) return null;

  const bogota = data.detalle.filter((d) => d.zona === "BOGOTA");
  const costa = data.detalle.filter((d) => d.zona === "COSTA");
  const datosGrafico = data.detalle.map((d) => ({ nombre: d.nombre.split(" ")[0], horasOrdinarias: d.horasOrdinarias, heDiurna: d.heDiurna, heNocturna: d.heNocturna, recargos: d.totalRecargos }));

  const columns = [
    { key: "nombre", label: "Técnico", sortable: true },
    { key: "zona", label: "Zona", render: (d: DetalleUsuario) => <span className={d.zona === "BOGOTA" ? "badge-blue" : "badge-green"}>{d.zona}</span> },
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
        <div><h2 className="text-2xl font-bold text-gray-900">Dashboard Global</h2>
          <p className="text-gray-500">{format(ahora, "MMMM yyyy", { locale: es })}</p></div>
        <div className="flex gap-2">
          {["ALL", "BOGOTA", "COSTA"].map((z) => (
            <button key={z} onClick={() => { setZonaFilter(z); setLoading(true); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${zonaFilter === z ? "bg-primary-600 text-white" : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"}`}>
              {z === "ALL" ? "Todas" : z}
            </button>
          ))}
        </div>
      </div>
      {data.alertas.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-yellow-800 mb-2">Alertas ({data.alertas.length})</h4>
          <ul className="space-y-1">{data.alertas.map((a, i) => <li key={i} className="text-sm text-yellow-700">⚠ {a.mensaje}</li>)}</ul>
        </div>
      )}
      <KPICards data={{ totalTecnicos: data.resumen.totalTecnicos, horasOrdinarias: data.resumen.totalHorasOrdinarias, totalHorasExtra: data.resumen.totalHorasExtra, totalRecargos: data.resumen.totalRecargos, totalDisponibilidades: data.resumen.totalDisponibilidades }} showTeamMetrics />
      {zonaFilter === "ALL" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard titulo="Zona Bogotá" valor={`${bogota.length} técnicos`}
            subtitulo={`${Math.round(bogota.reduce((s, d) => s + d.totalHorasExtra, 0) * 100) / 100}h extras`} icono={HiOfficeBuilding} color="blue" />
          <StatCard titulo="Zona Costa" valor={`${costa.length} técnicos`}
            subtitulo={`${Math.round(costa.reduce((s, d) => s + d.totalHorasExtra, 0) * 100) / 100}h extras`} icono={HiUserGroup} color="green" />
        </div>
      )}
      <GraficoHoras datos={datosGrafico} titulo="Consolidado de Horas" />
      <div><h3 className="text-lg font-semibold text-gray-900 mb-4">Detalle por Técnico</h3>
        <DataTable columns={columns as never} data={data.detalle as never} searchable searchPlaceholder="Buscar técnico..." /></div>
    </div>
  );
}