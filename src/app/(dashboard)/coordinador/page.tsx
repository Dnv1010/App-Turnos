"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import KPICards from "@/components/dashboard/KPICards";
import GraficoHoras from "@/components/dashboard/GraficoHoras";
import DataTable from "@/components/ui/DataTable";
import { HiDownload, HiSearch, HiTruck, HiPhotograph, HiExternalLink } from "react-icons/hi";

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

interface ReporteData {
  detalle: DetalleUsuario[];
  resumen: {
    totalTecnicos: number; totalHorasExtra: number; totalRecargos: number;
    totalHorasOrdinarias: number; totalDisponibilidades: number;
    totalKmRecorridos: number; totalRegistrosForaneo: number;
  };
  alertas: Array<{ nombre: string; mensaje: string }>;
}

type TabView = "equipo" | "foraneos";

export default function CoordinadorPage() {
  const { data: session } = useSession();
  const ahora = new Date();
  const [inicio, setInicio] = useState(format(startOfMonth(ahora), "yyyy-MM-dd"));
  const [fin, setFin] = useState(format(endOfMonth(ahora), "yyyy-MM-dd"));
  const [tecnicoFilter, setTecnicoFilter] = useState("ALL");
  const [data, setData] = useState<ReporteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tabView, setTabView] = useState<TabView>("equipo");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const cargarDatos = useCallback(async () => {
    if (!session?.user?.zona) return;
    setLoading(true);
    const params = new URLSearchParams({ inicio, fin, zona: session.user.zona });
    if (tecnicoFilter !== "ALL") params.set("userId", tecnicoFilter);
    try {
      const res = await fetch(`/api/reportes?${params}`);
      setData(await res.json());
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  }, [session?.user?.zona, inicio, fin, tecnicoFilter]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const exportarCSV = () => {
    if (!data) return;
    const headers = [
      "Técnico", "Zona", "Turnos", "H. Ordinarias", "HE Diurna", "HE Nocturna",
      "HE Dominical", "HE Noct.Dom", "Rec. Nocturno", "Rec. Dominical", "Rec. Noct.Dom",
      "Total HE", "Total Recargos", "Km Recorridos", "Reg. Foráneos", "Links Fotos Drive",
    ];
    const rows = data.detalle.map((d) => [
      d.nombre, d.zona, d.totalTurnos, d.horasOrdinarias, d.heDiurna, d.heNocturna,
      d.heDominical, d.heNoctDominical, d.recNocturno, d.recDominical, d.recNoctDominical,
      d.totalHorasExtra, d.totalRecargos, d.totalKmRecorridos, d.registrosForaneo,
      d.fotos.filter((f) => f.driveUrl).map((f) => f.driveUrl).join(" | "),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte_${session?.user?.zona}_${inicio}_${fin}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }
  if (!data) return null;

  const datosGrafico = data.detalle.map((d) => ({
    nombre: d.nombre.split(" ")[0],
    horasOrdinarias: d.horasOrdinarias,
    heDiurna: d.heDiurna,
    heNocturna: d.heNocturna,
    recargos: d.totalRecargos,
  }));

  const columnsEquipo = [
    { key: "nombre", label: "Técnico", sortable: true },
    { key: "totalTurnos", label: "Turnos", sortable: true },
    { key: "horasOrdinarias", label: "Ordinarias", sortable: true },
    { key: "totalHorasExtra", label: "HE Total", sortable: true },
    { key: "heDiurna", label: "HE Día" },
    { key: "heNocturna", label: "HE Noc" },
    { key: "totalRecargos", label: "Recargos", sortable: true },
    { key: "totalKmRecorridos", label: "Km",
      render: (d: DetalleUsuario) => d.totalKmRecorridos > 0 ? `${d.totalKmRecorridos} km` : "—" },
  ];

  const columnsForaneo = [
    { key: "nombre", label: "Técnico", sortable: true },
    { key: "registrosForaneo", label: "Registros", sortable: true },
    { key: "totalKmRecorridos", label: "Km Total", sortable: true,
      render: (d: DetalleUsuario) => d.totalKmRecorridos > 0 ? <strong>{d.totalKmRecorridos} km</strong> : "—" },
    { key: "fotos", label: "Fotos Drive",
      render: (d: DetalleUsuario) => {
        const fotosConUrl = d.fotos.filter((f) => f.tipo === "FORANEO" && f.driveUrl);
        return fotosConUrl.length > 0 ? (
          <button onClick={() => setExpandedUser(expandedUser === d.userId ? null : d.userId)}
            className="text-primary-600 hover:text-primary-800 text-xs font-medium">
            {fotosConUrl.length} fotos ▾
          </button>
        ) : "—";
      },
    },
  ];

  const foraneoData = data.detalle.filter((d) => d.registrosForaneo > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard Equipo</h2>
          <p className="text-gray-500">
            Zona {session?.user?.zona} — {session?.user?.nombre}
          </p>
        </div>
        <button onClick={exportarCSV} className="btn-secondary flex items-center gap-2">
          <HiDownload className="h-5 w-5" />Exportar CSV
        </button>
      </div>

      {/* Filtros */}
      <div className="card">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
            <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Técnico</label>
            <select value={tecnicoFilter} onChange={(e) => setTecnicoFilter(e.target.value)} className="input-field">
              <option value="ALL">Todos los técnicos</option>
              {data.detalle.map((d) => (
                <option key={d.userId} value={d.userId}>{d.nombre}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={cargarDatos} disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
              {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><HiSearch className="h-5 w-5" />Filtrar</>}
            </button>
          </div>
        </div>
      </div>

      {data.alertas.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-yellow-800 mb-2">Alertas</h4>
          <ul className="space-y-1">
            {data.alertas.map((a, i) => (
              <li key={i} className="text-sm text-yellow-700">⚠ {a.mensaje}</li>
            ))}
          </ul>
        </div>
      )}

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

      {/* Tabs Equipo / Foráneos */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setTabView("equipo")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${tabView === "equipo" ? "border-primary-600 text-primary-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          <HiPhotograph className="h-4 w-4" />Detalle Equipo
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

      {tabView === "equipo" && (
        <>
          <GraficoHoras datos={datosGrafico} titulo="Horas por Técnico — Mi Equipo" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Detalle por Técnico</h3>
            <DataTable columns={columnsEquipo as never} data={data.detalle as never} searchable searchPlaceholder="Buscar técnico..." />
          </div>
        </>
      )}

      {tabView === "foraneos" && (
        <>
          {data.resumen.totalKmRecorridos > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="card bg-orange-50 border-orange-200">
                <p className="text-xs text-orange-600 font-medium uppercase">Total Km Equipo</p>
                <p className="text-2xl font-bold text-orange-800 mt-1">{data.resumen.totalKmRecorridos} km</p>
              </div>
              <div className="card bg-blue-50 border-blue-200">
                <p className="text-xs text-blue-600 font-medium uppercase">Registros Foráneos</p>
                <p className="text-2xl font-bold text-blue-800 mt-1">{data.resumen.totalRegistrosForaneo}</p>
              </div>
              <div className="card bg-green-50 border-green-200">
                <p className="text-xs text-green-600 font-medium uppercase">Técnicos con Foráneos</p>
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
    </div>
  );
}
