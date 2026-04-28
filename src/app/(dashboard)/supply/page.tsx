"use client";

import { useAuth } from "@/lib/auth-provider";
import { useState, useEffect, useCallback, useMemo } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { formatFechaTurnoDdMmmYyyy } from "@/lib/formatFechaTurno";
import { parseResponseJson } from "@/lib/parseFetchJson";
import { useTurnosStream } from "@/hooks/useTurnosStream";
import KPICards from "@/components/dashboard/KPICards";
import GraficoHoras from "@/components/dashboard/GraficoHoras";
import DataTable from "@/components/ui/DataTable";
import { HiDownload, HiSearch, HiPhotograph, HiLocationMarker, HiRefresh, HiTrash } from "react-icons/hi";
import { getZonaLabel } from "@/lib/roleLabels";
import SupplyPushSetup from "@/components/supply/SupplyPushSetup";
interface TurnoRow {
  id: string;
  userId: string;
  date: string;
  clockInAt: string;
  clockOutAt: string | null;
  regularHours?: number;
  daytimeOvertimeHours?: number;
  nighttimeOvertimeHours?: number;
  sundayOvertimeHours?: number;
  nightSundayOvertimeHours?: number;
  nightSurchargeHours?: number;
  sundaySurchargeHours?: number;
  nightSundaySurchargeHours?: number;
  clockInLat: number | null;
  clockInLng: number | null;
  clockOutLat: number | null;
  clockOutLng: number | null;
  startPhotoUrl: string | null;
  endPhotoUrl: string | null;
  user: { fullName: string; zone: string; jobTitle?: string };
}

interface FotoInfo {
  id: string;
  type: string;
  driveUrl: string | null;
  startKm: number | null;
  endKm: number | null;
  kmRecorridos: number | null;
  notes: string | null;
  createdAt: string;
}

interface TurnoConMalla {
  id: string;
  date: string;
  malla?: string;
  [key: string]: unknown;
}

interface DetalleUsuario {
  userId: string; fullName: string; documentNumber?: string; zone: string; role?: string; totalTurnos: number; regularHours: number;
  daytimeOvertimeHours: number; nighttimeOvertimeHours: number; sundayOvertimeHours: number; nightSundayOvertimeHours: number;
  nightSurchargeHours: number; sundaySurchargeHours: number; nightSundaySurchargeHours: number;
  totalHorasExtra: number; totalRecargos: number; totalDisponibilidades: number;
  totalHorasTrabajadas?: number;
  totalKmRecorridos: number; registrosForaneo: number; fotos: FotoInfo[];
  turnos?: (TurnoConMalla & { date: string; clockInAt: string; clockOutAt?: string | null; regularHours?: number; daytimeOvertimeHours?: number; nighttimeOvertimeHours?: number; nightSurchargeHours?: number; sundaySurchargeHours?: number; nightSundaySurchargeHours?: number })[];
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
  alertas: Array<{ fullName: string; mensaje: string; tipo?: string }>;
}

type TabView = "turnos" | "equipo" | "disponibilidades";

export default function SupplyDashboardPage() {
  const { profile } = useAuth();
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
  const [disponibilidadesList, setDisponibilidadesList] = useState<Array<{ fullName: string; documentNumber: string; date: string; amount: number }>>([]);
  const [loadingDisp, setLoadingDisp] = useState(false);
  const [reporteError, setReporteError] = useState<string | null>(null);
  const [syncingSheets, setSyncingSheets] = useState(false);
  const [filtroZona, setFiltroZona] = useState<"ALL" | "BOGOTA" | "COSTA" | "INTERIOR">("ALL");

  const detalleFiltrado = useMemo(() => {
    if (!data?.detalle) return [];
    if (filtroZona === "ALL") return data.detalle;
    return data.detalle.filter((d) => d.zone === filtroZona);
  }, [data?.detalle, filtroZona]);

  const resumenEquipo = useMemo(() => {
    if (!data) return null;
    if (filtroZona === "ALL") return data.resumen;
    const d = detalleFiltrado;
    return {
      totalTecnicos: d.length,
      totalHorasExtra: Math.round(d.reduce((s, x) => s + x.totalHorasExtra, 0) * 100) / 100,
      totalRecargos: Math.round(d.reduce((s, x) => s + x.totalRecargos, 0) * 100) / 100,
      totalHorasOrdinarias: Math.max(0, Math.round(d.reduce((s, x) => s + x.regularHours, 0) * 100) / 100),
      totalDisponibilidades: d.reduce((s, x) => s + x.totalDisponibilidades, 0),
      totalKmRecorridos: 0,
      totalRegistrosForaneo: 0,
    };
  }, [data, filtroZona, detalleFiltrado]);

  const turnosFiltradosPorZona = useMemo(() => {
    if (filtroZona === "ALL") return turnos;
    return turnos.filter((t) => t.user?.zone === filtroZona);
  }, [turnos, filtroZona]);

  const alertasFiltradas = useMemo(() => {
    if (!data?.alertas) return [];
    if (filtroZona === "ALL") return data.alertas;
    const names = new Set(detalleFiltrado.map((d) => d.fullName));
    return data.alertas.filter((a) => names.has(a.fullName));
  }, [data?.alertas, detalleFiltrado, filtroZona]);

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
    if (!profile) return;
    setLoadingTurnos(true);
    try {
      const params = new URLSearchParams({ inicio, fin, zona: "ALL" });
      if (tecnicoFilter !== "ALL") params.set("userId", tecnicoFilter);
      const res = await fetch(`/api/turnos?${params}`);
      const raw = await parseResponseJson<TurnoRow[] | { error?: string }>(res);
      let list: TurnoRow[] = Array.isArray(raw) ? raw : [];
      if (!res.ok) list = [];
      if (estadoFilter === "ACTIVO") list = list.filter((t) => !t.clockOutAt);
      if (estadoFilter === "FINALIZADO") list = list.filter((t) => t.clockOutAt);
      list = list.filter((t) => (t.user?.jobTitle || "TECNICO") === "ALMACENISTA");
      setTurnos(list);
    } catch { /* ignore */ }
    finally { setLoadingTurnos(false); }
  }, [profile, inicio, fin, tecnicoFilter, estadoFilter]);

  const cargarReportes = useCallback(async () => {
    if (!profile) return;
    setLoadingReportes(true);
    setReporteError(null);
    const z = "ALL";
    const params = new URLSearchParams({ inicio, fin, zona: z, rol: "TECNICO" });
    if (tecnicoFilter !== "ALL") params.set("userId", tecnicoFilter);
    try {
      const [resAlm, resRep] = await Promise.all([
        fetch(`/api/usuarios?zona=${encodeURIComponent(z)}&role=TECNICO&cargo=ALMACENISTA`),
        fetch(`/api/reportes?${params}`),
      ]);
      const almJson = (await resAlm.json()) as { tecnicos?: { id: string; documentNumber?: string }[] };
      const almList = almJson?.tecnicos ?? [];
      const almIds = new Set(almList.map((t) => t.id));
      const json = await parseResponseJson<ReporteData & { error?: string }>(resRep);
      if (!resRep.ok || !json || !Array.isArray(json.detalle) || !json.resumen) {
        setData(null);
        setReporteError(!resRep.ok ? (json?.error || `Error ${resRep.status}`) : "Respuesta inválida del servidor");
        return;
      }
      const soloAlmacenistas = json.detalle.filter((d) => almIds.has(d.userId));
      const nombresAlm = new Set(soloAlmacenistas.map((d) => d.fullName));
      const resumen: ReporteData["resumen"] = {
        totalTecnicos: soloAlmacenistas.length,
        totalHorasExtra: Math.round(soloAlmacenistas.reduce((s, d) => s + d.totalHorasExtra, 0) * 100) / 100,
        totalRecargos: Math.round(soloAlmacenistas.reduce((s, d) => s + d.totalRecargos, 0) * 100) / 100,
        totalHorasOrdinarias: Math.max(
          0,
          Math.round(soloAlmacenistas.reduce((s, d) => s + d.regularHours, 0) * 100) / 100
        ),
        totalDisponibilidades: soloAlmacenistas.reduce((s, d) => s + d.totalDisponibilidades, 0),
        totalKmRecorridos: 0,
        totalRegistrosForaneo: 0,
      };
      const alertas = json.alertas.filter((a) => nombresAlm.has(a.fullName));
      setData({ ...json, detalle: soloAlmacenistas, resumen, alertas });
    } catch (e) {
      setData(null);
      setReporteError(e instanceof Error ? e.message : "Error al cargar reportes");
    } finally {
      setLoadingReportes(false);
    }
  }, [profile, inicio, fin, tecnicoFilter]);

  useEffect(() => { cargarTurnos(); }, [cargarTurnos]);
  useEffect(() => { if (tabView !== "turnos") cargarReportes(); }, [tabView, cargarReportes]);
  useEffect(() => {
    if (tabView === "disponibilidades" && profile) {
      setLoadingDisp(true);
      const q = `${tecnicoFilter !== "ALL" ? `&userId=${tecnicoFilter}` : ""}`;
      fetch(`/api/usuarios?zona=ALL&role=TECNICO&cargo=ALMACENISTA`)
        .then((r) => r.json())
        .then((d: { tecnicos?: { documentNumber?: string; zone?: string }[] }) => {
          const tec = d?.tecnicos ?? [];
          const ced = new Set(tec.map((t) => String(t.documentNumber ?? "")).filter(Boolean));
          const cedToZona = new Map(tec.map((t) => [String(t.documentNumber ?? ""), t.zone || "BOGOTA"]));
          return fetch(`/api/reportes/disponibilidades?desde=${inicio}&hasta=${fin}${q}`)
            .then(async (r) => parseResponseJson<typeof disponibilidadesList>(r))
            .then((j) => {
              let rows = Array.isArray(j) ? j.filter((row) => ced.has(row.documentNumber)) : [];
              if (filtroZona !== "ALL") {
                rows = rows.filter((row) => cedToZona.get(row.documentNumber) === filtroZona);
              }
              return rows;
            });
        })
        .then(setDisponibilidadesList)
        .catch(() => setDisponibilidadesList([]))
        .finally(() => setLoadingDisp(false));
    }
  }, [tabView, inicio, fin, tecnicoFilter, profile, filtroZona]);
  useEffect(() => {
    if (!profile) return;
    fetch(`/api/usuarios?zona=ALL&role=TECNICO&cargo=ALMACENISTA`)
      .then(async (r) => parseResponseJson<{ tecnicos?: { id: string; fullName: string }[] }>(r))
      .then((d) => {
        if (d?.tecnicos) setTecnicosList(d.tecnicos.map((u) => ({ id: u.id, nombre: u.fullName })));
      })
      .catch(() => {});
  }, [profile]);

  const exportarCSV = () => {
    if (!data) return;
    const headers = [
      "Operador", "Zona", "Turnos", "H. Ordinarias", "HE Diurna", "HE Nocturna",
      "Total HE", "Total Recargos", "Malla", "Links Fotos Drive",
    ];
    const rows = detalleFiltrado.map((d) => [
      d.fullName, getZonaLabel(d.zone), d.totalTurnos, d.regularHours, d.daytimeOvertimeHours, d.nighttimeOvertimeHours,
      d.totalHorasExtra, d.totalRecargos, mallaResumen(d.turnos),
      d.fotos.filter((f) => f.driveUrl).map((f) => f.driveUrl).join(" | "),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte_${filtroZona === "ALL" ? "todas_zonas" : filtroZona}_${inicio}_${fin}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportarExcel = async () => {
    if (!profile) return;
    const params = new URLSearchParams({ desde: inicio, hasta: fin });
    if (tecnicoFilter !== "ALL") params.set("userId", tecnicoFilter);
    const res = await fetch(`/api/reportes/excel?${params}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte_todas_zonas_${inicio}_${fin}.xlsx`;
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
    { key: "user", label: "Operador", render: (t: TurnoRow) => t.user?.fullName ?? "—" },
    { key: "date", label: "Fecha", render: (t: TurnoRow) => formatFechaTurnoDdMmmYyyy(t.date) },
    { key: "clockInAt", label: "Entrada", render: (t: TurnoRow) => new Date(t.clockInAt).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }) },
    { key: "clockOutAt", label: "Salida", render: (t: TurnoRow) => t.clockOutAt ? new Date(t.clockOutAt).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }) : "—" },
    { key: "regularHours", label: "Ord.", render: (t: TurnoRow) => Math.max(0, t.regularHours ?? 0) },
    { key: "daytimeOvertimeHours", label: "HE Día", render: (t: TurnoRow) => (t.daytimeOvertimeHours ?? 0) > 0 ? (t.daytimeOvertimeHours ?? 0) : "—" },
    { key: "nighttimeOvertimeHours", label: "HE Noc", render: (t: TurnoRow) => (t.nighttimeOvertimeHours ?? 0) > 0 ? (t.nighttimeOvertimeHours ?? 0) : "—" },
    { key: "sundayOvertimeHours", label: "HE Dom/Fest Día", render: (t: TurnoRow) => (t.sundayOvertimeHours ?? 0) > 0 ? (t.sundayOvertimeHours ?? 0) : "—" },
    { key: "nightSundayOvertimeHours", label: "HE Dom/Fest Noc", render: (t: TurnoRow) => (t.nightSundayOvertimeHours ?? 0) > 0 ? (t.nightSundayOvertimeHours ?? 0) : "—" },
    { key: "nightSurchargeHours", label: "Rec. Noc", render: (t: TurnoRow) => (t.nightSurchargeHours ?? 0) > 0 ? (t.nightSurchargeHours ?? 0) : "—" },
    { key: "sundaySurchargeHours", label: "Rec Dom/Fest Día", render: (t: TurnoRow) => (t.sundaySurchargeHours ?? 0) > 0 ? (t.sundaySurchargeHours ?? 0) : "—" },
    { key: "nightSundaySurchargeHours", label: "Rec Dom/Fest Noc", render: (t: TurnoRow) => (t.nightSundaySurchargeHours ?? 0) > 0 ? (t.nightSundaySurchargeHours ?? 0) : "—" },
    { key: "clockInLat", label: "Ubicación inicio", render: (t: TurnoRow) => t.clockInLat != null && t.clockInLng != null ? <a href={`https://www.google.com/maps?q=${t.clockInLat},${t.clockInLng}`} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline flex items-center gap-1"><HiLocationMarker className="h-3.5 w-3.5" />Mapa</a> : "—" },
    { key: "clockOutLat", label: "Ubicación fin", render: (t: TurnoRow) => t.clockOutLat != null && t.clockOutLng != null ? <a href={`https://www.google.com/maps?q=${t.clockOutLat},${t.clockOutLng}`} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline flex items-center gap-1"><HiLocationMarker className="h-3.5 w-3.5" />Mapa</a> : "—" },
    { key: "startPhotoUrl", label: "Foto inicio", render: (t: TurnoRow) => t.startPhotoUrl ? <a href={t.startPhotoUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 dark:text-bia-teal-light hover:underline text-xs">Ver</a> : "—" },
    { key: "endPhotoUrl", label: "Foto fin", render: (t: TurnoRow) => t.endPhotoUrl ? <a href={t.endPhotoUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 dark:text-bia-teal-light hover:underline text-xs">Ver</a> : "—" },
    { key: "estado", label: "Estado", render: (t: TurnoRow) => t.clockOutAt ? <span className="badge-blue">FINALIZADO</span> : <span className="badge-green">ACTIVO</span> },
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
    <>
      <SupplyPushSetup />
      <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Dashboard Supply</h2>
          <p className="text-sm text-gray-500 dark:text-bia-muted">
            Todas las Zonas — Solo Almacenistas
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data && (
            <>
              <button onClick={exportarCSV} className="btn-secondary flex items-center gap-2 py-2 px-3 sm:py-2.5 sm:px-5 text-sm"><HiDownload className="h-4 w-4 sm:h-5 sm:w-5" />Exportar CSV</button>
              <button onClick={() => void exportarExcel()} className="btn-secondary flex items-center gap-2 py-2 px-3 sm:py-2.5 sm:px-5 text-sm"><HiDownload className="h-4 w-4 sm:h-5 sm:w-5" />Exportar Excel</button>
              <button onClick={() => void sincronizarSheets()} disabled={syncingSheets} className="btn-secondary flex items-center gap-2 py-2 px-3 sm:py-2.5 sm:px-5 text-sm"><HiRefresh className="h-4 w-4 sm:h-5 sm:w-5" />{syncingSheets ? "Sincronizando…" : "Sincronizar Sheets"}</button>
            </>
          )}
        </div>
      </div>

      <div className="card p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 sm:gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-bia-label mb-1">Desde</label>
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-bia-label mb-1">Hasta</label>
            <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-bia-label mb-1">Operador</label>
            <select value={tecnicoFilter} onChange={(e) => setTecnicoFilter(e.target.value)} className="input-field">
              <option value="ALL">Todos</option>
              {tecnicosList.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-bia-label mb-1">Estado</label>
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

      <div className="flex gap-2 border-b border-gray-200 dark:border-[#3A4565] overflow-x-auto pb-0 scrollbar-hide min-w-0">
        <button onClick={() => setTabView("turnos")} className={`flex-shrink-0 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap ${tabView === "turnos" ? "border-primary-600 text-primary-700 dark:border-bia-teal dark:text-bia-teal" : "border-transparent text-gray-500 dark:text-bia-muted"}`}>
          Turnos
        </button>
        <button onClick={() => setTabView("equipo")} className={`flex-shrink-0 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium border-b-2 flex items-center gap-1.5 whitespace-nowrap ${tabView === "equipo" ? "border-primary-600 text-primary-700 dark:border-bia-teal dark:text-bia-teal" : "border-transparent text-gray-500 dark:text-bia-muted"}`}>
          <HiPhotograph className="h-3.5 w-3.5 sm:h-4 sm:w-4" />Reporte Equipo
        </button>
        <button onClick={() => setTabView("disponibilidades")} className={`flex-shrink-0 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap ${tabView === "disponibilidades" ? "border-primary-600 text-primary-700 dark:border-bia-teal dark:text-bia-teal" : "border-transparent text-gray-500 dark:text-bia-muted"}`}>
          Disponibilidades
        </button>
      </div>

      {tabView === "turnos" && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Turnos almacenistas</h3>
          <div className="flex gap-2 mb-3 flex-wrap">
            {(["ALL", "BOGOTA", "COSTA", "INTERIOR"] as const).map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setFiltroZona(z)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  filtroZona === z
                    ? "bg-primary-600 text-white border-primary-600"
                    : "border-gray-300 dark:border-[#3A4565] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#243052]"
                }`}
              >
                {z === "ALL" ? "Todas" : z === "BOGOTA" ? "Bogotá" : z === "COSTA" ? "Costa" : "Interior"}
              </button>
            ))}
          </div>
          {turnos.length === 0 ? (
            <div className="card text-center py-12 text-gray-500 dark:text-bia-muted">No hay turnos en el período seleccionado</div>
          ) : turnosFiltradosPorZona.length === 0 ? (
            <div className="card text-center py-12 text-gray-500 dark:text-bia-muted">No hay turnos para la zona seleccionada</div>
          ) : (
            <DataTable columns={columnsTurnos as never} data={turnosFiltradosPorZona as never} searchable searchPlaceholder="Buscar operador..." />
          )}
        </div>
      )}

      {tabView === "equipo" && (
        <>
          {loadingReportes && !data ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>
          ) : reporteError && !data ? (
            <div className="card text-center py-12 text-amber-700 dark:text-amber-300">{reporteError}</div>
          ) : !data?.detalle?.length ? (
            <div className="card text-center py-12 text-gray-500 dark:text-bia-muted">No hay registros para este período</div>
          ) : data && resumenEquipo ? (
        <>
          <div className="flex gap-2 mb-3 flex-wrap">
            {(["ALL", "BOGOTA", "COSTA", "INTERIOR"] as const).map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setFiltroZona(z)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  filtroZona === z
                    ? "bg-primary-600 text-white border-primary-600"
                    : "border-gray-300 dark:border-[#3A4565] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#243052]"
                }`}
              >
                {z === "ALL" ? "Todas" : z === "BOGOTA" ? "Bogotá" : z === "COSTA" ? "Costa" : "Interior"}
              </button>
            ))}
          </div>
          {alertasFiltradas.length > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-2">Alertas</h4>
              <ul className="space-y-1">{alertasFiltradas.map((a, i) => <li key={i} className="text-sm text-yellow-700 dark:text-yellow-300">⚠ {a.mensaje}</li>)}</ul>
            </div>
          )}
          <KPICards data={{ totalTecnicos: resumenEquipo.totalTecnicos, horasOrdinarias: resumenEquipo.totalHorasOrdinarias, totalHorasExtra: resumenEquipo.totalHorasExtra, totalRecargos: resumenEquipo.totalRecargos, totalDisponibilidades: resumenEquipo.totalDisponibilidades }} showTeamMetrics />
          <GraficoHoras datos={detalleFiltrado.map((d) => ({ nombre: d.fullName.split(" ")[0], horasOrdinarias: d.regularHours, heDiurna: d.daytimeOvertimeHours, heNocturna: d.nighttimeOvertimeHours, recargos: d.totalRecargos }))} titulo="Horas por operador" />
          {detalleFiltrado.length === 0 ? (
            <div className="card text-center py-12 text-gray-500 dark:text-bia-muted">No hay registros para la zona seleccionada</div>
          ) : (
          <DataTable columns={[
            { key: "fullName", label: "Nombre", sortable: true },
            { key: "documentNumber", label: "Cedula" },
            { key: "zone", label: "Zona", render: (d: DetalleUsuario) => getZonaLabel(d.zone) },
            { key: "totalTurnos", label: "Turnos" },
            { key: "regularHours", label: "Ordinarias" },
            { key: "daytimeOvertimeHours", label: "HE Dia" },
            { key: "nighttimeOvertimeHours", label: "HE Noc" },
            { key: "sundayOvertimeHours", label: "HE Dom/Fest Dia" },
            { key: "nightSundayOvertimeHours", label: "HE Dom/Fest Noc" },
            { key: "nightSurchargeHours", label: "Rec Nocturno" },
            { key: "sundaySurchargeHours", label: "Rec Dom/Fest Dia" },
            { key: "nightSundaySurchargeHours", label: "Rec Dom/Fest Noc" },
            { key: "totalHorasExtra", label: "Total HE" },
            { key: "totalRecargos", label: "Total Recargos" },
          ] as never} data={detalleFiltrado as never} searchable searchPlaceholder="Buscar operador..." />
          )}
            </>
          ) : null}
        </>
      )}

      {tabView === "disponibilidades" && (
        <>
          <div className="flex gap-2 mb-3 flex-wrap">
            {(["ALL", "BOGOTA", "COSTA", "INTERIOR"] as const).map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setFiltroZona(z)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  filtroZona === z
                    ? "bg-primary-600 text-white border-primary-600"
                    : "border-gray-300 dark:border-[#3A4565] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#243052]"
                }`}
              >
                {z === "ALL" ? "Todas" : z === "BOGOTA" ? "Bogotá" : z === "COSTA" ? "Costa" : "Interior"}
              </button>
            ))}
          </div>
          {loadingDisp ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>
          ) : disponibilidadesList.length === 0 ? (
            <div className="card text-center py-12 text-gray-500 dark:text-bia-muted">No hay disponibilidades en este período (días con tipo DISPONIBLE en la malla)</div>
          ) : (
            <DataTable
              columns={[
                { key: "fullName", label: "Nombre", sortable: true },
                { key: "documentNumber", label: "Cédula" },
                { key: "date", label: "Fecha" },
                { key: "amount", label: "Valor ($80.000/día)", render: (r: { amount: number }) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(r.amount) },
              ] as never}
              data={disponibilidadesList as never}
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
    </>
  );
}