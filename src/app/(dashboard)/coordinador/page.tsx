"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import KPICards from "@/components/dashboard/KPICards";
import GraficoHoras from "@/components/dashboard/GraficoHoras";
import DataTable from "@/components/ui/DataTable";
import { HiDownload, HiSearch, HiTruck, HiPhotograph, HiExternalLink, HiLocationMarker } from "react-icons/hi";

interface TurnoRow {
  id: string;
  userId: string;
  fecha: string;
  horaEntrada: string;
  horaSalida: string | null;
  latEntrada: number | null;
  lngEntrada: number | null;
  latSalida: number | null;
  lngSalida: number | null;
  startPhotoUrl: string | null;
  endPhotoUrl: string | null;
  user: { nombre: string; zona: string };
}

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

interface TurnoConMalla {
  id: string;
  fecha: string;
  malla?: string;
  [key: string]: unknown;
}

interface DetalleUsuario {
  userId: string; nombre: string; zona: string; totalTurnos: number; horasOrdinarias: number;
  heDiurna: number; heNocturna: number; heDominical: number; heNoctDominical: number;
  recNocturno: number; recDominical: number; recNoctDominical: number;
  totalHorasExtra: number; totalRecargos: number; totalDisponibilidades: number;
  totalKmRecorridos: number; registrosForaneo: number; fotos: FotoInfo[];
  turnos?: TurnoConMalla[];
}

function isBlockMalla(val: string): boolean {
  if (!val) return false;
  const v = val.toLowerCase();
  return v.includes("descanso") || v.includes("vacacion") || v.includes("dia de la familia") || v.includes("semana santa") || v.includes("keynote");
}

function mallaResumen(turnos: TurnoConMalla[] | undefined): string {
  if (!turnos?.length) return "";
  const counts: Record<string, number> = {};
  turnos.forEach((t) => { const m = t.malla || "Sin malla"; counts[m] = (counts[m] || 0) + 1; });
  return Object.entries(counts).map(([k, n]) => `${k} (${n})`).join("; ");
}

interface ReporteData {
  detalle: DetalleUsuario[];
  resumen: {
    totalTecnicos: number; totalHorasExtra: number; totalRecargos: number;
    totalHorasOrdinarias: number; totalDisponibilidades: number;
    totalKmRecorridos: number; totalRegistrosForaneo: number;
  };
  alertas: Array<{ nombre: string; mensaje: string; tipo?: string }>;
}

type TabView = "turnos" | "equipo" | "foraneos";

export default function CoordinadorPage() {
  const { data: session } = useSession();
  const ahora = new Date();
  const [inicio, setInicio] = useState(format(startOfMonth(ahora), "yyyy-MM-dd"));
  const [fin, setFin] = useState(format(endOfMonth(ahora), "yyyy-MM-dd"));
  const [tecnicoFilter, setTecnicoFilter] = useState("ALL");
  const [estadoFilter, setEstadoFilter] = useState<"ALL" | "ACTIVO" | "FINALIZADO">("ALL");
  const [turnos, setTurnos] = useState<TurnoRow[]>([]);
  const [tecnicosList, setTecnicosList] = useState<{ id: string; nombre: string }[]>([]);
  const [loadingTurnos, setLoadingTurnos] = useState(true);
  const [data, setData] = useState<ReporteData | null>(null);
  const [loadingReportes, setLoadingReportes] = useState(true);
  const [tabView, setTabView] = useState<TabView>("turnos");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const cargarTurnos = useCallback(async () => {
    if (!session?.user?.zona) return;
    setLoadingTurnos(true);
    try {
      const params = new URLSearchParams({ inicio, fin, zona: session.user.zona });
      if (tecnicoFilter !== "ALL") params.set("userId", tecnicoFilter);
      const res = await fetch(`/api/turnos?${params}`);
      let list: TurnoRow[] = await res.json();
      if (estadoFilter === "ACTIVO") list = list.filter((t) => !t.horaSalida);
      if (estadoFilter === "FINALIZADO") list = list.filter((t) => t.horaSalida);
      setTurnos(list);
    } catch { /* ignore */ }
    finally { setLoadingTurnos(false); }
  }, [session?.user?.zona, inicio, fin, tecnicoFilter, estadoFilter]);

  const cargarReportes = useCallback(async () => {
    if (!session?.user?.zona) return;
    setLoadingReportes(true);
    const params = new URLSearchParams({ inicio, fin, zona: session.user.zona });
    if (tecnicoFilter !== "ALL") params.set("userId", tecnicoFilter);
    try {
      const res = await fetch(`/api/reportes?${params}`);
      setData(await res.json());
    } catch { /* ignore */ }
    finally { setLoadingReportes(false); }
  }, [session?.user?.zona, inicio, fin, tecnicoFilter]);

  useEffect(() => { cargarTurnos(); }, [cargarTurnos]);
  useEffect(() => { if (tabView !== "turnos") cargarReportes(); }, [tabView, cargarReportes]);

  useEffect(() => {
    if (!session?.user?.zona) return;
    fetch(`/api/usuarios?zona=${session.user.zona}&role=TECNICO`)
      .then((r) => r.json())
      .then((d) => { if (d.tecnicos) setTecnicosList(d.tecnicos.map((u: { id: string; nombre: string }) => ({ id: u.id, nombre: u.nombre }))); })
      .catch(() => {});
  }, [session?.user?.zona]);

  const exportarCSV = () => {
    if (!data) return;
    const headers = [
      "Técnico", "Zona", "Turnos", "H. Ordinarias", "HE Diurna", "HE Nocturna",
      "Total HE", "Total Recargos", "Malla", "Km Recorridos", "Reg. Foráneos", "Links Fotos Drive",
    ];
    const rows = data.detalle.map((d) => [
      d.nombre, d.zona, d.totalTurnos, d.horasOrdinarias, d.heDiurna, d.heNocturna,
      d.totalHorasExtra, d.totalRecargos, mallaResumen(d.turnos),
      d.totalKmRecorridos,
      d.totalKmRecorridos > 0 ? `${d.totalKmRecorridos} km` : "—",
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

  const columnsTurnos = [
    { key: "user", label: "Técnico", render: (t: TurnoRow) => t.user?.nombre ?? "—" },
    { key: "fecha", label: "Fecha", render: (t: TurnoRow) => format(new Date(t.fecha), "dd MMM yyyy", { locale: es }) },
    { key: "horaEntrada", label: "Entrada", render: (t: TurnoRow) => new Date(t.horaEntrada).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) },
    { key: "horaSalida", label: "Salida", render: (t: TurnoRow) => t.horaSalida ? new Date(t.horaSalida).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : "—" },
    { key: "latEntrada", label: "Ubicación inicio", render: (t: TurnoRow) => t.latEntrada != null && t.lngEntrada != null ? <a href={`https://www.google.com/maps?q=${t.latEntrada},${t.lngEntrada}`} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline flex items-center gap-1"><HiLocationMarker className="h-3.5 w-3.5" />Mapa</a> : "—" },
    { key: "latSalida", label: "Ubicación fin", render: (t: TurnoRow) => t.latSalida != null && t.lngSalida != null ? <a href={`https://www.google.com/maps?q=${t.latSalida},${t.lngSalida}`} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline flex items-center gap-1"><HiLocationMarker className="h-3.5 w-3.5" />Mapa</a> : "—" },
    { key: "startPhotoUrl", label: "Foto inicio", render: (t: TurnoRow) => t.startPhotoUrl ? <a href={t.startPhotoUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline text-xs">Ver</a> : "—" },
    { key: "endPhotoUrl", label: "Foto fin", render: (t: TurnoRow) => t.endPhotoUrl ? <a href={t.endPhotoUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline text-xs">Ver</a> : "—" },
    { key: "estado", label: "Estado", render: (t: TurnoRow) => t.horaSalida ? <span className="badge-blue">FINALIZADO</span> : <span className="badge-green">ACTIVO</span> },
  ];

  if (loadingTurnos && tabView === "turnos" && turnos.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard Equipo</h2>
          <p className="text-gray-500">Zona {session?.user?.zona} — {session?.user?.nombre}</p>
        </div>
        {data && <button onClick={exportarCSV} className="btn-secondary flex items-center gap-2"><HiDownload className="h-5 w-5" />Exportar CSV</button>}
      </div>

      <div className="card">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
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
              <option value="ALL">Todos</option>
              {tecnicosList.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
            <select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value as "ALL" | "ACTIVO" | "FINALIZADO")} className="input-field">
              <option value="ALL">Todos</option>
              <option value="ACTIVO">Activo</option>
              <option value="FINALIZADO">Finalizado</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={cargarTurnos} disabled={loadingTurnos} className="btn-primary w-full flex items-center justify-center gap-2">
              {loadingTurnos ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><HiSearch className="h-5 w-5" />Filtrar</>}
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        <button onClick={() => setTabView("turnos")} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${tabView === "turnos" ? "border-primary-600 text-primary-700" : "border-transparent text-gray-500"}`}>
          Turnos
        </button>
        <button onClick={() => setTabView("equipo")} className={`px-4 py-2.5 text-sm font-medium border-b-2 flex items-center gap-1.5 ${tabView === "equipo" ? "border-primary-600 text-primary-700" : "border-transparent text-gray-500"}`}>
          <HiPhotograph className="h-4 w-4" />Reporte Equipo
        </button>
        <button onClick={() => setTabView("foraneos")} className={`px-4 py-2.5 text-sm font-medium border-b-2 flex items-center gap-1.5 ${tabView === "foraneos" ? "border-primary-600 text-primary-700" : "border-transparent text-gray-500"}`}>
          <HiTruck className="h-4 w-4" />Foráneos
          {data && data.resumen.totalRegistrosForaneo > 0 && <span className="bg-orange-100 text-orange-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{data.resumen.totalRegistrosForaneo}</span>}
        </button>
      </div>

      {tabView === "turnos" && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Turnos del equipo</h3>
          {turnos.length === 0 ? (
            <div className="card text-center py-12 text-gray-500">No hay turnos en el período seleccionado</div>
          ) : (
            <DataTable columns={columnsTurnos as never} data={turnos as never} searchable searchPlaceholder="Buscar técnico..." />
          )}
        </div>
      )}

      {tabView === "equipo" && data && (
        <>
          {data.alertas.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-yellow-800 mb-2">Alertas</h4>
              <ul className="space-y-1">{data.alertas.map((a, i) => <li key={i} className="text-sm text-yellow-700">⚠ {a.mensaje}</li>)}</ul>
            </div>
          )}
          <KPICards data={{ totalTecnicos: data.resumen.totalTecnicos, horasOrdinarias: data.resumen.totalHorasOrdinarias, totalHorasExtra: data.resumen.totalHorasExtra, totalRecargos: data.resumen.totalRecargos, totalDisponibilidades: data.resumen.totalDisponibilidades }} showTeamMetrics />
          <GraficoHoras datos={data.detalle.map((d) => ({ nombre: d.nombre.split(" ")[0], horasOrdinarias: d.horasOrdinarias, heDiurna: d.heDiurna, heNocturna: d.heNocturna, recargos: d.totalRecargos }))} titulo="Horas por Técnico" />
          <DataTable columns={[
            { key: "nombre", label: "Técnico", sortable: true },
            { key: "totalTurnos", label: "Turnos" },
            { key: "horasOrdinarias", label: "Ordinarias" },
            { key: "totalHorasExtra", label: "HE Total" },
            { key: "totalRecargos", label: "Recargos" },
            { key: "malla", label: "Malla", render: (d: DetalleUsuario) => {
              const resumen = mallaResumen(d.turnos);
              if (!resumen) return "—";
              const hasBlock = (d.turnos || []).some((t) => t.malla && isBlockMalla(t.malla));
              return <span className={`text-xs font-medium px-2 py-0.5 rounded ${hasBlock ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`} title={resumen}>{resumen.length > 35 ? resumen.slice(0, 32) + "…" : resumen}</span>;
            } },
            { key: "totalKmRecorridos", label: "Km", render: (d: DetalleUsuario) => d.totalKmRecorridos > 0 ? `${d.totalKmRecorridos} km` : "—" },
            { key: "regForaneos", label: "Reg. Foráneos", render: (d: DetalleUsuario) => {
              const km = d.fotos.filter((f) => f.tipo === "FORANEO" && f.kmInicial != null && f.kmFinal != null)
                .reduce((s, f) => s + (f.kmFinal! - f.kmInicial!), 0);
              return km > 0 ? `${Math.round(km * 100) / 100} km` : "—";
            } },
          ] as never} data={data.detalle as never} searchable searchPlaceholder="Buscar técnico..." />
        </>
      )}

      {tabView === "foraneos" && data && (
        <>
          {data.resumen.totalKmRecorridos > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="card bg-orange-50 border-orange-200"><p className="text-xs text-orange-600 font-medium uppercase">Total Km</p><p className="text-2xl font-bold text-orange-800 mt-1">{data.resumen.totalKmRecorridos} km</p></div>
              <div className="card bg-blue-50 border-blue-200"><p className="text-xs text-blue-600 font-medium uppercase">Registros Foráneos</p><p className="text-2xl font-bold text-blue-800 mt-1">{data.resumen.totalRegistrosForaneo}</p></div>
              <div className="card bg-green-50 border-green-200"><p className="text-xs text-green-600 font-medium uppercase">Técnicos</p><p className="text-2xl font-bold text-green-800 mt-1">{data.detalle.filter((d) => d.registrosForaneo > 0).length}</p></div>
            </div>
          )}
          {data.detalle.filter((d) => d.registrosForaneo > 0).length === 0 ? (
            <div className="card text-center py-12"><HiTruck className="h-16 w-16 text-gray-300 mx-auto mb-4" /><p className="text-gray-500">No hay registros foráneos en este período</p></div>
          ) : (
            <>
              <DataTable columns={[
                { key: "nombre", label: "Técnico" },
                { key: "registrosForaneo", label: "Registros" },
                { key: "totalKmRecorridos", label: "Km Total", render: (d: DetalleUsuario) => d.totalKmRecorridos > 0 ? <strong>{d.totalKmRecorridos} km</strong> : "—" },
                { key: "fotos", label: "Fotos", render: (d: DetalleUsuario) => {
                  const fotosConUrl = d.fotos.filter((f) => f.tipo === "FORANEO" && f.driveUrl);
                  return fotosConUrl.length > 0 ? <button type="button" onClick={() => setExpandedUser(expandedUser === d.userId ? null : d.userId)} className="text-primary-600 hover:text-primary-800 text-xs font-medium">{fotosConUrl.length} fotos ▾</button> : "—";
                } },
              ] as never} data={data.detalle.filter((d) => d.registrosForaneo > 0) as never} searchable searchPlaceholder="Buscar técnico..." />
              {expandedUser && (
                <div className="card">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Detalle Foráneos — {data.detalle.find((d) => d.userId === expandedUser)?.nombre}</h4>
                  <div className="space-y-2">
                    {data.detalle.find((d) => d.userId === expandedUser)?.fotos.filter((f) => f.tipo === "FORANEO").map((foto) => (
                      <div key={foto.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                        <div className="flex-1">
                          <span className="text-sm text-gray-700">{new Date(foto.fecha).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}</span>
                          {foto.kmRecorridos != null && <span className="ml-3 text-sm font-medium text-orange-700">{foto.kmRecorridos} km</span>}
                          {foto.observaciones && <span className="ml-2 text-xs text-gray-400">— {foto.observaciones}</span>}
                        </div>
                        {foto.driveUrl && <a href={foto.driveUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-800 text-xs flex items-center gap-1"><HiExternalLink className="h-3.5 w-3.5" />Drive</a>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {tabView === "equipo" && loadingReportes && !data && (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>
      )}
      {tabView === "foraneos" && loadingReportes && !data && (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>
      )}
    </div>
  );
}
