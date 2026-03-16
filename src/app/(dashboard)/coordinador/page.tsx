"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import KPICards from "@/components/dashboard/KPICards";
import GraficoHoras from "@/components/dashboard/GraficoHoras";
import DataTable from "@/components/ui/DataTable";

interface DetalleUsuario {
  userId: string; nombre: string; zona: string; totalTurnos: number; horasOrdinarias: number;
  heDiurna: number; heNocturna: number; heDominical: number; heNoctDominical: number;
  recNocturno: number; recDominical: number; recNoctDominical: number;
  totalHorasExtra: number; totalRecargos: number; totalDisponibilidades: number;
}

interface ReporteData {
  detalle: DetalleUsuario[];
  resumen: { totalTecnicos: number; totalHorasExtra: number; totalRecargos: number; totalHorasOrdinarias: number; totalDisponibilidades: number; };
  alertas: Array<{ nombre: string; mensaje: string }>;
}

export default function CoordinadorPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<ReporteData | null>(null);
  const [loading, setLoading] = useState(true);

  const ahora = new Date();
  const inicio = format(startOfMonth(ahora), "yyyy-MM-dd");
  const fin = format(endOfMonth(ahora), "yyyy-MM-dd");

  useEffect(() => {
    if (!session?.user?.zona) return;
    fetch(`/api/reportes?inicio=${inicio}&fin=${fin}&zona=${session.user.zona}`)
      .then((r) => r.json()).then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [session?.user?.zona, inicio, fin]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  if (!data) return null;

  const datosGrafico = data.detalle.map((d) => ({ nombre: d.nombre.split(" ")[0], horasOrdinarias: d.horasOrdinarias, heDiurna: d.heDiurna, heNocturna: d.heNocturna, recargos: d.totalRecargos }));

  const columns = [
    { key: "nombre", label: "Técnico", sortable: true },
    { key: "totalTurnos", label: "Turnos", sortable: true },
    { key: "horasOrdinarias", label: "Ordinarias", sortable: true },
    { key: "totalHorasExtra", label: "HE Total", sortable: true },
    { key: "heDiurna", label: "HE Diurna" },
    { key: "heNocturna", label: "HE Nocturna" },
    { key: "totalRecargos", label: "Recargos", sortable: true },
    { key: "totalDisponibilidades", label: "Disponib.",
      render: (d: DetalleUsuario) => d.totalDisponibilidades > 0 ? new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(d.totalDisponibilidades) : "—" },
  ];

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold text-gray-900">Mi Equipo</h2>
        <p className="text-gray-500">Zona {session?.user?.zona} — {format(ahora, "MMMM yyyy", { locale: es })}</p></div>
      {data.alertas.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-yellow-800 mb-2">Alertas</h4>
          <ul className="space-y-1">{data.alertas.map((a, i) => <li key={i} className="text-sm text-yellow-700">⚠ {a.mensaje}</li>)}</ul>
        </div>
      )}
      <KPICards data={{ totalTecnicos: data.resumen.totalTecnicos, horasOrdinarias: data.resumen.totalHorasOrdinarias, totalHorasExtra: data.resumen.totalHorasExtra, totalRecargos: data.resumen.totalRecargos, totalDisponibilidades: data.resumen.totalDisponibilidades }} showTeamMetrics />
      <GraficoHoras datos={datosGrafico} titulo="Horas por Técnico — Mi Equipo" />
      <div><h3 className="text-lg font-semibold text-gray-900 mb-4">Detalle por Técnico</h3>
        <DataTable columns={columns as never} data={data.detalle as never} searchable searchPlaceholder="Buscar técnico..." /></div>
    </div>
  );
}
