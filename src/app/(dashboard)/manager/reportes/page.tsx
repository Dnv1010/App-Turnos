"use client";

import { useState } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import KPICards from "@/components/dashboard/KPICards";
import DataTable from "@/components/ui/DataTable";
import { HiDownload, HiSearch, HiTruck, HiExternalLink } from "react-icons/hi";

interface FotoInfo {
  id: string;
  tipo: string;
  driveUrl: string | null;
  kmInicial: number | null;
  kmFinal: number | null;
  kmRecorridos: number | null;
  observaciones: string | null;
  fecha: string;
}

interface DetalleUsuario {
  userId: string; nombre: string; zona: string; totalTurnos: number; horasOrdinarias: number;
  heDiurna: number; heNocturna: number; heDominical: number; heNoctDominical: number;
  recNocturno: number; recDominical: number; recNoctDominical: number;
  totalHorasExtra: number; totalRecargos: number; totalDisponibilidades: number;
  totalKmRecorridos: number; registrosForaneo: number; fotos: FotoInfo[];
}

interface ForaneoItem {
  id: string;
  fecha: string;
  tecnico: string;
  cedula: string | null;
  correo: string | null;
  tipo: string;
  kmInicial: number | null;
  kmFinal: number | null;
  distancia: number | null;
  observaciones: string | null;
  fotoUrl: string;
}

interface ReporteData {
  detalle: DetalleUsuario[];
  resumen: {
    totalTecnicos: number; totalHorasExtra: number; totalRecargos: number;
    totalHorasOrdinarias: number; totalDisponibilidades: number;
    totalKmRecorridos: number; totalRegistrosForaneo: number;
  };
  foraneos?: ForaneoItem[];
}

type TabView = "horas" | "foraneos";

export default function ReportesPage() {
  const ahora = new Date();
  const [inicio, setInicio] = useState(format(startOfMonth(ahora), "yyyy-MM-dd"));
  const [fin, setFin] = useState(format(endOfMonth(ahora), "yyyy-MM-dd"));
  const [zona, setZona] = useState("ALL");
  const [data, setData] = useState<ReporteData | null>(null);
  const [loading, setLoading] = useState(false);
  const [tabView, setTabView] = useState<TabView>("horas");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const buscar = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reportes?inicio=${inicio}&fin=${fin}&zona=${zona}`);
      setData(await res.json());
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  };

  const exportarCSV = () => {
    if (!data) return;
    const headers = [
      "Nombre", "Zona", "Turnos", "H. Ordinarias", "HE Diurna", "HE Nocturna",
      "HE Dominical", "HE Noct. Dominical", "Rec. Nocturno", "Rec. Dominical",
      "Rec. Noct. Dominical", "Total HE", "Total Recargos", "Disponibilidades",
      "Km Recorridos", "Reg. Foráneos", "Links Fotos Drive",
    ];
    const rows = data.detalle.map((d) => [
      d.nombre, d.zona, d.totalTurnos, d.horasOrdinarias, d.heDiurna, d.heNocturna,
      d.heDominical, d.heNoctDominical, d.recNocturno, d.recDominical, d.recNoctDominical,
      d.totalHorasExtra, d.totalRecargos, d.totalDisponibilidades,
      d.totalKmRecorridos, d.registrosForaneo,
      d.fotos.filter((f) => f.driveUrl).map((f) => f.driveUrl).join(" | "),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte_completo_${inicio}_${fin}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportarCSVForaneos = () => {
    if (!data?.foraneos?.length) return;
    const headers = ["Fecha", "Técnico", "Cédula", "Correo", "Tipo", "Km Inicial", "Km Final", "Distancia", "Observaciones", "Foto URL"];
    const rows = data.foraneos.map((f) => [
      f.fecha,
      f.tecnico,
      f.cedula ?? "",
      f.correo ?? "",
      f.tipo,
      f.kmInicial ?? "",
      f.kmFinal ?? "",
      f.distancia ?? "",
      (f.observaciones ?? "").replace(/"/g, '""'),
      f.fotoUrl,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${String(v)}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte_foraneos_${inicio}_${fin}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const columnsHoras = [
    { key: "nombre", label: "Técnico", sortable: true },
    { key: "zona", label: "Zona", render: (d: DetalleUsuario) => <span className={d.zona === "BOGOTA" ? "badge-blue" : "badge-green"}>{d.zona}</span> },
    { key: "totalTurnos", label: "Turnos", sortable: true },
    { key: "horasOrdinarias", label: "Ordinarias", sortable: true },
    { key: "heDiurna", label: "HE Día", sortable: true },
    { key: "heNocturna", label: "HE Noc", sortable: true },
    { key: "heDominical", label: "HE Dom." },
    { key: "recNocturno", label: "Rec. Noc." },
    { key: "totalHorasExtra", label: "Total HE", sortable: true },
    { key: "totalRecargos", label: "Total Rec.", sortable: true },
    { key: "totalKmRecorridos", label: "Km",
      render: (d: DetalleUsuario) => d.totalKmRecorridos > 0 ? `${d.totalKmRecorridos}` : "—" },
    { key: "totalDisponibilidades", label: "Disponib.",
      render: (d: DetalleUsuario) => d.totalDisponibilidades > 0
        ? new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(d.totalDisponibilidades) : "—" },
  ];

  const columnsForaneo = [
    { key: "nombre", label: "Técnico", sortable: true },
    { key: "zona", label: "Zona", render: (d: DetalleUsuario) => <span className={d.zona === "BOGOTA" ? "badge-blue" : "badge-green"}>{d.zona}</span> },
    { key: "registrosForaneo", label: "Registros", sortable: true },
    { key: "totalKmRecorridos", label: "Km Total", sortable: true,
      render: (d: DetalleUsuario) => d.totalKmRecorridos > 0 ? <strong>{d.totalKmRecorridos} km</strong> : "—" },
    { key: "fotos", label: "Fotos",
      render: (d: DetalleUsuario) => {
        const cnt = d.fotos.filter((f) => f.tipo === "FORANEO" && f.driveUrl).length;
        return cnt > 0 ? (
          <button onClick={() => setExpandedUser(expandedUser === d.userId ? null : d.userId)}
            className="text-primary-600 hover:text-primary-800 text-xs font-medium">
            {cnt} fotos ▾
          </button>
        ) : "—";
      },
    },
  ];

  const foraneoData = data ? data.detalle.filter((d) => d.registrosForaneo > 0) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Reportes</h2>
        {data && (
          <div className="flex flex-wrap gap-2">
            <button onClick={exportarCSV} className="btn-secondary flex items-center gap-2">
              <HiDownload className="h-5 w-5" />Exportar CSV
            </button>
            {data.foraneos && data.foraneos.length > 0 && (
              <button onClick={exportarCSVForaneos} className="btn-secondary flex items-center gap-2">
                <HiTruck className="h-5 w-5" />CSV Foráneos
              </button>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha inicio</label>
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha fin</label>
            <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Zona</label>
            <select value={zona} onChange={(e) => setZona(e.target.value)} className="input-field">
              <option value="ALL">Todas las zonas</option>
              <option value="BOGOTA">Bogotá</option>
              <option value="COSTA">Costa</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={buscar} disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
              {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><HiSearch className="h-5 w-5" />Generar</>}
            </button>
          </div>
        </div>
      </div>

      {data && (
        <>
          <KPICards
            data={{
              totalTecnicos: data.resumen.totalTecnicos,
              horasOrdinarias: data.resumen.totalHorasOrdinarias,
              totalHorasExtra: data.resumen.totalHorasExtra,
              totalRecargos: data.resumen.totalRecargos,
              totalDisponibilidades: data.resumen.totalDisponibilidades,
            }}
            showTeamMetrics
          />

          <div className="flex gap-2 border-b border-gray-200">
            <button
              onClick={() => setTabView("horas")}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tabView === "horas" ? "border-primary-600 text-primary-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Detalle Horas
            </button>
            <button
              onClick={() => setTabView("foraneos")}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${tabView === "foraneos" ? "border-primary-600 text-primary-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              <HiTruck className="h-4 w-4" />Reporte Foráneos
              {data.resumen.totalRegistrosForaneo > 0 && (
                <span className="bg-orange-100 text-orange-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {data.resumen.totalRegistrosForaneo}
                </span>
              )}
            </button>
          </div>

          {tabView === "horas" && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Detalle del Reporte</h3>
              <DataTable columns={columnsHoras as never} data={data.detalle as never} searchable searchPlaceholder="Buscar técnico..." />
            </div>
          )}

          {tabView === "foraneos" && (
            <>
              {data.resumen.totalKmRecorridos > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="card bg-orange-50 border-orange-200">
                    <p className="text-xs text-orange-600 font-medium uppercase">Total Km</p>
                    <p className="text-2xl font-bold text-orange-800 mt-1">{data.resumen.totalKmRecorridos} km</p>
                  </div>
                  <div className="card bg-blue-50 border-blue-200">
                    <p className="text-xs text-blue-600 font-medium uppercase">Registros Foráneos</p>
                    <p className="text-2xl font-bold text-blue-800 mt-1">{data.resumen.totalRegistrosForaneo}</p>
                  </div>
                  <div className="card bg-green-50 border-green-200">
                    <p className="text-xs text-green-600 font-medium uppercase">Técnicos</p>
                    <p className="text-2xl font-bold text-green-800 mt-1">{foraneoData.length}</p>
                  </div>
                </div>
              )}

              {foraneoData.length === 0 ? (
                <div className="card text-center py-12">
                  <HiTruck className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No hay registros foráneos en este período</p>
                </div>
              ) : (
                <>
                  {data.foraneos && data.foraneos.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-gray-900 mb-2">Detalle por registro (con tipo)</h4>
                      <DataTable
                        columns={[
                          { key: "fecha", label: "Fecha", render: (f: ForaneoItem) => new Date(f.fecha).toLocaleDateString("es-CO") },
                          { key: "tecnico", label: "Técnico", sortable: true },
                          { key: "cedula", label: "Cédula" },
                          { key: "correo", label: "Correo" },
                          { key: "tipo", label: "Tipo", sortable: true },
                          { key: "kmInicial", label: "Km Inicial", render: (f: ForaneoItem) => f.kmInicial ?? "—" },
                          { key: "kmFinal", label: "Km Final", render: (f: ForaneoItem) => f.kmFinal ?? "—" },
                          { key: "distancia", label: "Distancia", render: (f: ForaneoItem) => f.distancia != null ? `${f.distancia} km` : "—" },
                          { key: "observaciones", label: "Observaciones", render: (f: ForaneoItem) => (f.observaciones ?? "").slice(0, 40) + ((f.observaciones?.length ?? 0) > 40 ? "…" : "") },
                          { key: "fotoUrl", label: "Foto", render: (f: ForaneoItem) => f.fotoUrl ? <a href={f.fotoUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline text-xs flex items-center gap-1"><HiExternalLink className="h-3.5 w-3.5" />Ver</a> : "—" },
                        ] as never}
                        data={data.foraneos as never}
                        searchable
                        searchPlaceholder="Buscar técnico, cédula..."
                      />
                    </div>
                  )}
                  <DataTable columns={columnsForaneo as never} data={foraneoData as never} searchable searchPlaceholder="Buscar técnico..." />

                  {expandedUser && (
                    <div className="card">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">
                        Detalle Foráneos — {data.detalle.find((d) => d.userId === expandedUser)?.nombre}
                      </h4>
                      <div className="space-y-2">
                        {data.detalle
                          .find((d) => d.userId === expandedUser)
                          ?.fotos.filter((f) => f.tipo === "FORANEO")
                          .map((foto) => (
                            <div key={foto.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                              <div className="flex-1">
                                <span className="text-sm text-gray-700">
                                  {new Date(foto.fecha).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                                </span>
                                <span className="ml-2 text-xs font-medium text-gray-500">({foto.tipo})</span>
                                {foto.kmRecorridos != null && (
                                  <span className="ml-3 text-sm font-medium text-orange-700">{foto.kmRecorridos} km</span>
                                )}
                                {foto.observaciones && (
                                  <span className="ml-2 text-xs text-gray-400">— {foto.observaciones}</span>
                                )}
                              </div>
                              {foto.driveUrl && (
                                <a href={foto.driveUrl} target="_blank" rel="noopener noreferrer"
                                  className="text-primary-600 hover:text-primary-800 text-xs flex items-center gap-1">
                                  <HiExternalLink className="h-3.5 w-3.5" />Drive
                                </a>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
