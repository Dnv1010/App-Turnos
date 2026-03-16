"use client";

import { useState } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import KPICards from "@/components/dashboard/KPICards";
import DataTable from "@/components/ui/DataTable";
import { HiDownload, HiSearch } from "react-icons/hi";

interface DetalleUsuario {
  userId: string; nombre: string; zona: string; totalTurnos: number; horasOrdinarias: number;
  heDiurna: number; heNocturna: number; heDominical: number; heNoctDominical: number;
  recNocturno: number; recDominical: number; recNoctDominical: number;
  totalHorasExtra: number; totalRecargos: number; totalDisponibilidades: number;
}

interface ReporteData {
  detalle: DetalleUsuario[];
  resumen: { totalTecnicos: number; totalHorasExtra: number; totalRecargos: number; totalHorasOrdinarias: number; totalDisponibilidades: number; };
}

export default function ReportesPage() {
  const ahora = new Date();
  const [inicio, setInicio] = useState(format(startOfMonth(ahora), "yyyy-MM-dd"));
  const [fin, setFin] = useState(format(endOfMonth(ahora), "yyyy-MM-dd"));
  const [zona, setZona] = useState("ALL");
  const [data, setData] = useState<ReporteData | null>(null);
  const [loading, setLoading] = useState(false);

  const buscar = async () => {
    setLoading(true);
    try { const res = await fetch(`/api/reportes?inicio=${inicio}&fin=${fin}&zona=${zona}`); setData(await res.json()); }
    catch { console.error("Error cargando reporte"); }
    finally { setLoading(false); }
  };

  const exportarCSV = () => {
    if (!data) return;
    const headers = ["Nombre","Zona","Turnos","H. Ordinarias","HE Diurna","HE Nocturna","HE Dominical","HE Noct. Dominical","Rec. Nocturno","Rec. Dominical","Rec. Noct. Dominical","Total HE","Total Recargos","Disponibilidades"];
    const rows = data.detalle.map((d) => [d.nombre,d.zona,d.totalTurnos,d.horasOrdinarias,d.heDiurna,d.heNocturna,d.heDominical,d.heNoctDominical,d.recNocturno,d.recDominical,d.recNoctDominical,d.totalHorasExtra,d.totalRecargos,d.totalDisponibilidades]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `reporte_${inicio}_${fin}.csv`; link.click();
    URL.revokeObjectURL(url);
  };

  const columns = [
    { key: "nombre", label: "Técnico", sortable: true },
    { key: "zona", label: "Zona", render: (d: DetalleUsuario) => <span className={d.zona === "BOGOTA" ? "badge-blue" : "badge-green"}>{d.zona}</span> },
    { key: "totalTurnos", label: "Turnos", sortable: true },
    { key: "horasOrdinarias", label: "Ordinarias", sortable: true },
    { key: "heDiurna", label: "HE Diurna", sortable: true },
    { key: "heNocturna", label: "HE Nocturna", sortable: true },
    { key: "heDominical", label: "HE Dom.", sortable: true },
    { key: "recNocturno", label: "Rec. Noc." },
    { key: "recDominical", label: "Rec. Dom." },
    { key: "totalHorasExtra", label: "Total HE", sortable: true },
    { key: "totalRecargos", label: "Total Rec.", sortable: true },
    { key: "totalDisponibilidades", label: "Disponib.",
      render: (d: DetalleUsuario) => d.totalDisponibilidades > 0 ? new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(d.totalDisponibilidades) : "—" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Reportes</h2>
        {data && <button onClick={exportarCSV} className="btn-secondary flex items-center gap-2"><HiDownload className="h-5 w-5" />Exportar CSV</button>}
      </div>
      <div className="card">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Fecha inicio</label><input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="input-field" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Fecha fin</label><input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="input-field" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Zona</label><select value={zona} onChange={(e) => setZona(e.target.value)} className="input-field"><option value="ALL">Todas las zonas</option><option value="BOGOTA">Bogotá</option><option value="COSTA">Costa</option></select></div>
          <div className="flex items-end"><button onClick={buscar} disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><HiSearch className="h-5 w-5" />Generar</>}
          </button></div>
        </div>
      </div>
      {data && (
        <>
          <KPICards data={{ totalTecnicos: data.resumen.totalTecnicos, horasOrdinarias: data.resumen.totalHorasOrdinarias, totalHorasExtra: data.resumen.totalHorasExtra, totalRecargos: data.resumen.totalRecargos, totalDisponibilidades: data.resumen.totalDisponibilidades }} showTeamMetrics />
          <div><h3 className="text-lg font-semibold text-gray-900 mb-4">Detalle del Reporte</h3>
            <DataTable columns={columns as never} data={data.detalle as never} searchable searchPlaceholder="Buscar técnico..." /></div>
        </>
      )}
    </div>
  );
}
