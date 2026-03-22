"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { formatFechaTurnoDdMmmYyyy } from "@/lib/formatFechaTurno";
import { parseResponseJson } from "@/lib/parseFetchJson";
import { useTurnosStream } from "@/hooks/useTurnosStream";
import KPICards from "@/components/dashboard/KPICards";
import GraficoHoras from "@/components/dashboard/GraficoHoras";
import DataTable from "@/components/ui/DataTable";
import { HiDownload, HiSearch, HiTruck, HiPhotograph, HiExternalLink, HiLocationMarker, HiRefresh, HiTrash } from "react-icons/hi";

interface TurnoRow {
  id: string;
  userId: string;
  fecha: string;
  horaEntrada: string;
  horaSalida: string | null;
  horasOrdinarias?: number;
  heDiurna?: number;
  heNocturna?: number;
  heDominical?: number;
  heNoctDominical?: number;
  recNocturno?: number;
  recDominical?: number;
  recNoctDominical?: number;
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
  userId: string; nombre: string; cedula?: string; zona: string; role?: string; totalTurnos: number; horasOrdinarias: number;
  heDiurna: number; heNocturna: number; heDominical: number; heNoctDominical: number;
  recNocturno: number; recDominical: number; recNoctDominical: number;
  totalHorasExtra: number; totalRecargos: number; totalDisponibilidades: number;
  totalHorasTrabajadas?: number;
  totalKmRecorridos: number; registrosForaneo: number; fotos: FotoInfo[];
  turnos?: (TurnoConMalla & { fecha: string; horaEntrada: string; horaSalida?: string | null; horasOrdinarias?: number; heDiurna?: number; heNocturna?: number; recNocturno?: number; recDominical?: number; recNoctDominical?: number })[];
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

type TabView = "turnos" | "equipo" | "horasTotales" | "disponibilidades" | "foraneos";

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
  const [disponibilidadesList, setDisponibilidadesList] = useState<Array<{ nombre: string; cedula: string; fecha: string; valor: number }>>([]);
  const [foraneosList, setForaneosList] = useState<Array<{ nombre: string; cedula: string; cantidadForaneos: number; totalKm: number; totalPagar: number }>>([]);
  const [loadingDisp, setLoadingDisp] = useState(false);
  const [loadingForaneos, setLoadingForaneos] = useState(false);
  const [reporteError, setReporteError] = useState<string | null>(null);
  const [syncingSheets, setSyncingSheets] = useState(false);

  useTurnosStream(
    (data) => {
      console.log("Removiendo turno:", data.id);
      setTurnos((prev) => prev.filter((t) => t.id !== data.id));
      setData((prev) => prev ? { ...prev, detalle: prev.detalle.map(d => ({ ...d, turnos: d.turnos?.filter(t => t.id !== data.id) })) } : null);
    },
    (data) => {
      console.log("Reloading turnos por edicion");
      cargarTurnos();
      cargarReportes();
    }
  );

  const cargarTurnos = useCallback(async () => {
    if (!session?.user?.zona) return;
    setLoadingTurnos(true);
    try {
      const params = new URLSearchParams({ inicio, fin, zona: session.user.zona });
      if (tecnicoFilter !== "ALL") params.set("userId", tecnicoFilter);
      const res = await fetch(`/api/turnos?${params}`);
      const raw = await parseResponseJson<TurnoRow[] | { error?: string }>(res);
      let list: TurnoRow[] = Array.isArray(raw) ? raw : [];
      if (!res.ok) list = [];
      if (estadoFilter === "ACTIVO") list = list.filter((t) => !t.horaSalida);
      if (estadoFilter === "FINALIZADO") list = list.filter((t) => t.horaSalida);
      setTurnos(list);
    } catch { /* ignore */ }
    finally { setLoadingTurnos(false); }
  }, [session?.user?.zona, inicio, fin, tecnicoFilter, estadoFilter]);

  const cargarReportes = useCallback(async () => {
    if (!session?.user?.zona) return;
    setLoadingReportes(true);
    setReporteError(null);
    const params = new URLSearchParams({ inicio, fin, zona: session.user.zona });
    if (tecnicoFilter !== "ALL") params.set("userId", tecnicoFilter);
    try {
      const res = await fetch(`/api/reportes?${params}`);
      const json = await parseResponseJson<ReporteData & { error?: string }>(res);
      if (!res.ok || !json || !Array.isArray(json.detalle) || !json.resumen) {
        setData(null);
        setReporteError(!res.ok ? (json?.error || `Error ${res.status}`) : "Respuesta inválida del servidor");
        return;
      }
      setData(json as ReporteData);
    } catch (e) {
      setData(null);
      setReporteError(e instanceof Error ? e.message : "Error al cargar reportes");
    } finally {
      setLoadingReportes(false);
    }
  }, [session?.user?.zona, inicio, fin, tecnicoFilter]);

  useEffect(() => { cargarTurnos(); }, [cargarTurnos]);
  useEffect(() => { if (tabView !== "turnos") cargarReportes(); }, [tabView, cargarReportes]);
  useEffect(() => {
    if (tabView === "disponibilidades" && session?.user?.zona) {
      setLoadingDisp(true);
      fetch(`/api/reportes/disponibilidades?desde=${inicio}&hasta=${fin}${tecnicoFilter !== "ALL" ? `&userId=${tecnicoFilter}` : ""}`)
        .then(async (r) => {
          const j = await parseResponseJson<typeof disponibilidadesList>(r);
          return Array.isArray(j) ? j : [];
        })
        .then(setDisponibilidadesList)
        .catch(() => setDisponibilidadesList([]))
        .finally(() => setLoadingDisp(false));
    }
  }, [tabView, inicio, fin, tecnicoFilter, session?.user?.zona]);
  useEffect(() => {
    if (tabView === "foraneos" && session?.user?.zona) {
      setLoadingForaneos(true);
      fetch(`/api/reportes/foraneos?desde=${inicio}&hasta=${fin}${tecnicoFilter !== "ALL" ? `&userId=${tecnicoFilter}` : ""}`)
        .then(async (r) => {
          const j = await parseResponseJson<typeof foraneosList>(r);
          return Array.isArray(j) ? j : [];
        })
        .then(setForaneosList)
        .catch(() => setForaneosList([]))
        .finally(() => setLoadingForaneos(false));
    }
  }, [tabView, inicio, fin, tecnicoFilter, session?.user?.zona]);

  useEffect(() => {
    if (!session?.user?.zona) return;
    fetch(`/api/usuarios?zona=${session.user.zona}&role=TECNICO`)
      .then(async (r) => parseResponseJson<{ tecnicos?: { id: string; nombre: string }[] }>(r))
      .then((d) => {
        if (d?.tecnicos) setTecnicosList(d.tecnicos.map((u) => ({ id: u.id, nombre: u.nombre })));
      })
      .catch(() => {});
  }, [session?.user?.zona]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void cargarTurnos();
        void cargarReportes();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [cargarTurnos, cargarReportes]);

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

  const exportarExcel = async () => {
    if (!session?.user?.zona) return;
    const params = new URLSearchParams({ desde: inicio, hasta: fin });
    if (tecnicoFilter !== "ALL") params.set("userId", tecnicoFilter);
    const res = await fetch(`/api/reportes/excel?${params}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte_${session?.user?.zona}_${inicio}_${fin}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const sincronizarSheets = async () => {
    setSyncingSheets(true);
    try {
      const res = await fetch("/api/sheets/sync", { method: "POST" });
      if (res.ok) alert("Google Sheets sincronizados correctamente.");
      else {
        const err = await parseResponseJson<{ error?: string }>(res);
        alert(err?.error ?? "Error al sincronizar Sheets.");
      }
    } catch {
      alert("Error al sincronizar Sheets.");
    } finally {
      setSyncingSheets(false);
    }
  };

  const handleEliminarTurno = async (turnoId: string) => {
    if (!confirm("¿Eliminar este turno?")) return;
    try {
      const res = await fetch(`/api/turnos/${turnoId}`, { method: "DELETE" });
      if (res.ok) {
        setTurnos((prev) => prev.filter((t) => t.id !== turnoId));
        setData((prev) => prev ? { ...prev, detalle: prev.detalle.map(d => ({ ...d, turnos: d.turnos?.filter(t => t.id !== turnoId) })) } : null);
      } else {
        alert("Error al eliminar turno");
      }
    } catch (e) {
      alert("Error: " + (e instanceof Error ? e.message : "desconocido"));
    }
  };

  const columnsTurnos = [
    { key: "user", label: "Técnico", render: (t: TurnoRow) => t.user?.nombre ?? "—" },
    { key: "fecha", label: "Fecha", render: (t: TurnoRow) => formatFechaTurnoDdMmmYyyy(t.fecha) },
    { key: "horaEntrada", label: "Entrada", render: (t: TurnoRow) => new Date(t.horaEntrada).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }) },
    { key: "horaSalida", label: "Salida", render: (t: TurnoRow) => t.horaSalida ? new Date(t.horaSalida).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }) : "—" },
    { key: "horasOrdinarias", label: "Ord.", render: (t: TurnoRow) => Math.max(0, t.horasOrdinarias ?? 0) },
    { key: "heDiurna", label: "HE Día", render: (t: TurnoRow) => (t.heDiurna ?? 0) > 0 ? (t.heDiurna ?? 0) : "—" },
    { key: "heNocturna", label: "HE Noc", render: (t: TurnoRow) => (t.heNocturna ?? 0) > 0 ? (t.heNocturna ?? 0) : "—" },
    { key: "heDominical", label: "HE Dom/Fest Día", render: (t: TurnoRow) => (t.heDominical ?? 0) > 0 ? (t.heDominical ?? 0) : "—" },
    { key: "heNoctDominical", label: "HE Dom/Fest Noc", render: (t: TurnoRow) => (t.heNoctDominical ?? 0) > 0 ? (t.heNoctDominical ?? 0) : "—" },
    { key: "recNocturno", label: "Rec. Noc", render: (t: TurnoRow) => (t.recNocturno ?? 0) > 0 ? (t.recNocturno ?? 0) : "—" },
    { key: "recDominical", label: "Rec Dom/Fest Día", render: (t: TurnoRow) => (t.recDominical ?? 0) > 0 ? (t.recDominical ?? 0) : "—" },
    { key: "recNoctDominical", label: "Rec Dom/Fest Noc", render: (t: TurnoRow) => (t.recNoctDominical ?? 0) > 0 ? (t.recNoctDominical ?? 0) : "—" },
    { key: "latEntrada", label: "Ubicación inicio", render: (t: TurnoRow) => t.latEntrada != null && t.lngEntrada != null ? <a href={`https://www.google.com/maps?q=${t.latEntrada},${t.lngEntrada}`} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline flex items-center gap-1"><HiLocationMarker className="h-3.5 w-3.5" />Mapa</a> : "—" },
    { key: "latSalida", label: "Ubicación fin", render: (t: TurnoRow) => t.latSalida != null && t.lngSalida != null ? <a href={`https://www.google.com/maps?q=${t.latSalida},${t.lngSalida}`} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline flex items-center gap-1"><HiLocationMarker className="h-3.5 w-3.5" />Mapa</a> : "—" },
    { key: "startPhotoUrl", label: "Foto inicio", render: (t: TurnoRow) => t.startPhotoUrl ? <a href={t.startPhotoUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline text-xs">Ver</a> : "—" },
    { key: "endPhotoUrl", label: "Foto fin", render: (t: TurnoRow) => t.endPhotoUrl ? <a href={t.endPhotoUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline text-xs">Ver</a> : "—" },
    { key: "estado", label: "Estado", render: (t: TurnoRow) => t.horaSalida ? <span className="badge-blue">FINALIZADO</span> : <span className="badge-green">ACTIVO</span> },
    { key: "acciones", label: "Acciones", render: (t: TurnoRow) => <button onClick={() => handleEliminarTurno(t.id)} className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs flex items-center gap-1"><HiTrash className="h-3 w-3" />Eliminar</button> },
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Dashboard Equipo</h2>
          <p className="text-sm text-gray-500">Zona {session?.user?.zona} — {session?.user?.nombre}</p>
        </div>
        {data && (
          <div className="flex flex-wrap gap-2">
            <button onClick={exportarCSV} className="btn-secondary flex items-center gap-2 py-2 px-3 sm:py-2.5 sm:px-5 text-sm"><HiDownload className="h-4 w-4 sm:h-5 sm:w-5" />Exportar CSV</button>
            <button onClick={() => void exportarExcel()} className="btn-secondary flex items-center gap-2 py-2 px-3 sm:py-2.5 sm:px-5 text-sm"><HiDownload className="h-4 w-4 sm:h-5 sm:w-5" />Exportar Excel</button>
            <button onClick={() => void sincronizarSheets()} disabled={syncingSheets} className="btn-secondary flex items-center gap-2 py-2 px-3 sm:py-2.5 sm:px-5 text-sm"><HiRefresh className="h-4 w-4 sm:h-5 sm:w-5" />{syncingSheets ? "Sincronizando…" : "Sincronizar Sheets"}</button>
          </div>
        )}
      </div>

      <div className="card p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 sm:gap-4">
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

      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto pb-0 scrollbar-hide min-w-0">
        <button onClick={() => setTabView("turnos")} className={`flex-shrink-0 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap ${tabView === "turnos" ? "border-primary-600 text-primary-700" : "border-transparent text-gray-500"}`}>
          Turnos
        </button>
        <button onClick={() => setTabView("equipo")} className={`flex-shrink-0 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium border-b-2 flex items-center gap-1.5 whitespace-nowrap ${tabView === "equipo" ? "border-primary-600 text-primary-700" : "border-transparent text-gray-500"}`}>
          <HiPhotograph className="h-3.5 w-3.5 sm:h-4 sm:w-4" />Reporte Equipo
        </button>
        <button onClick={() => setTabView("horasTotales")} className={`flex-shrink-0 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap ${tabView === "horasTotales" ? "border-primary-600 text-primary-700" : "border-transparent text-gray-500"}`}>
          Horas Totales
        </button>
        <button onClick={() => setTabView("disponibilidades")} className={`flex-shrink-0 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap ${tabView === "disponibilidades" ? "border-primary-600 text-primary-700" : "border-transparent text-gray-500"}`}>
          Disponibilidades
        </button>
        <button onClick={() => setTabView("foraneos")} className={`flex-shrink-0 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium border-b-2 flex items-center gap-1.5 whitespace-nowrap ${tabView === "foraneos" ? "border-primary-600 text-primary-700" : "border-transparent text-gray-500"}`}>
          <HiTruck className="h-3.5 w-3.5 sm:h-4 sm:w-4" />Foráneos / Km
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

      {tabView === "equipo" && (
        <>
          {loadingReportes && !data ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>
          ) : reporteError && !data ? (
            <div className="card text-center py-12 text-amber-700">{reporteError}</div>
          ) : !data?.detalle?.length ? (
            <div className="card text-center py-12 text-gray-500">No hay registros para este período</div>
          ) : data ? (
        <>
          {data.alertas?.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-yellow-800 mb-2">Alertas</h4>
              <ul className="space-y-1">{data.alertas.map((a, i) => <li key={i} className="text-sm text-yellow-700">⚠ {a.mensaje}</li>)}</ul>
            </div>
          )}
          <KPICards data={{ totalTecnicos: data.resumen.totalTecnicos, horasOrdinarias: data.resumen.totalHorasOrdinarias, totalHorasExtra: data.resumen.totalHorasExtra, totalRecargos: data.resumen.totalRecargos, totalDisponibilidades: data.resumen.totalDisponibilidades }} showTeamMetrics />
          <GraficoHoras datos={data.detalle.map((d) => ({ nombre: d.nombre.split(" ")[0], horasOrdinarias: d.horasOrdinarias, heDiurna: d.heDiurna, heNocturna: d.heNocturna, recargos: d.totalRecargos }))} titulo="Horas por Técnico" />
          <DataTable columns={[
            { key: "nombre", label: "Nombre", sortable: true },
            { key: "cedula", label: "Cedula" },
            { key: "zona", label: "Zona" },
            { key: "totalTurnos", label: "Turnos" },
            { key: "horasOrdinarias", label: "Ordinarias" },
            { key: "heDiurna", label: "HE Dia" },
            { key: "heNocturna", label: "HE Noc" },
            { key: "heDominical", label: "HE Dom/Fest Dia" },
            { key: "heNoctDominical", label: "HE Dom/Fest Noc" },
            { key: "recNocturno", label: "Rec Nocturno" },
            { key: "recDominical", label: "Rec Dom/Fest Dia" },
            { key: "recNoctDominical", label: "Rec Dom/Fest Noc" },
            { key: "totalHorasExtra", label: "Total HE" },
            { key: "totalRecargos", label: "Total Recargos" },
            { key: "totalKmRecorridos", label: "Km", render: (d: DetalleUsuario) => d.totalKmRecorridos > 0 ? `${d.totalKmRecorridos} km` : "—" },
          ] as never} data={data.detalle as never} searchable searchPlaceholder="Buscar técnico..." />
            </>
          ) : null}
        </>
      )}

      {tabView === "horasTotales" && (
        <>
          {loadingReportes && !data ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>
          ) : reporteError && !data ? (
            <div className="card text-center py-12 text-amber-700">{reporteError}</div>
          ) : !data?.detalle?.length ? (
            <div className="card text-center py-12 text-gray-500">No hay registros para este período</div>
          ) : (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Resumen de horas por técnico</h3>
              <DataTable
                columns={[
                  { key: "nombre", label: "Nombre", sortable: true },
                  { key: "cedula", label: "Cédula", render: (d: DetalleUsuario) => d.cedula ?? "—" },
                  { key: "totalTurnos", label: "Total Turnos" },
                  { key: "totalHorasTrabajadas", label: "Horas Trabajadas Total", render: (d: DetalleUsuario) => d.totalHorasTrabajadas ?? 0 },
                  { key: "horasOrdinarias", label: "Horas Ordinarias" },
                  { key: "heDiurna", label: "HE Diurna" },
                  { key: "heNocturna", label: "HE Nocturna" },
                  { key: "heDominical", label: "HE Dom/Fest Diurna" },
                  { key: "heNoctDominical", label: "HE Dom/Fest Nocturna" },
                  { key: "recNocturno", label: "Recargo Nocturno" },
                  { key: "recDominical", label: "Recargo Dom/Fest Diurno" },
                  { key: "recNoctDominical", label: "Recargo Dom/Fest Nocturno" },
                  { key: "totalHorasExtra", label: "Total HE" },
                  { key: "totalRecargos", label: "Total Recargos" },
                ] as never}
                data={data.detalle as never}
                searchable
                searchPlaceholder="Buscar técnico..."
              />
            </div>
          )}
        </>
      )}

      {tabView === "disponibilidades" && (
        <>
          {loadingDisp ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>
          ) : disponibilidadesList.length === 0 ? (
            <div className="card text-center py-12 text-gray-500">No hay disponibilidades en este período (días con tipo DISPONIBLE en la malla)</div>
          ) : (
            <DataTable
              columns={[
                { key: "nombre", label: "Nombre", sortable: true },
                { key: "cedula", label: "Cédula" },
                { key: "fecha", label: "Fecha" },
                { key: "valor", label: "Valor ($80.000/día)", render: (r: { valor: number }) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(r.valor) },
              ] as never}
              data={disponibilidadesList as never}
              searchable
              searchPlaceholder="Buscar nombre..."
            />
          )}
        </>
      )}

      {tabView === "foraneos" && (
        <>
          {loadingForaneos ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>
          ) : foraneosList.length === 0 ? (
            <div className="card text-center py-12"><HiTruck className="h-16 w-16 text-gray-300 mx-auto mb-4" /><p className="text-gray-500">No hay registros foráneos en este período</p></div>
          ) : (
            <DataTable
              columns={[
                { key: "nombre", label: "Nombre", sortable: true },
                { key: "cedula", label: "Cédula" },
                { key: "cantidadForaneos", label: "Cant. Foráneos" },
                { key: "totalKm", label: "Total Km", render: (r: { totalKm: number }) => `${r.totalKm} km` },
                { key: "totalPagar", label: "Total a Pagar", render: (r: { totalPagar: number }) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(r.totalPagar) },
              ] as never}
              data={foraneosList as never}
              searchable
              searchPlaceholder="Buscar nombre..."
            />
          )}
        </>
      )}

      {tabView === "equipo" && loadingReportes && !data && (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>
      )}
    </div>
  );
}