"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { parseResponseJson } from "@/lib/parseFetchJson";
import { VALOR_DISPONIBILIDAD_TECNICO } from "@/lib/reporteDisponibilidadValor";
import { getRoleLabel, getZonaLabel } from "@/lib/roleLabels";
import { HiDownload, HiTrash, HiRefresh, HiCheckCircle, HiDocumentText } from "react-icons/hi";

const TARIFA_KM = 1100;

type PreviewTurno = {
  id: string;
  fecha: string;
  horaEntrada: string;
  horaSalida: string | null;
  heDiurna: number;
  heNocturna: number;
  heDominical: number;
  heNoctDominical: number;
  recNocturno: number;
  recDominical: number;
  recNoctDominical: number;
  horasOrdinarias: number;
  user: { nombre: string; cedula: string | null; zona: string };
};

type PreviewForaneo = {
  id: string;
  createdAt: string;
  kmInicial: number | null;
  kmFinal: number | null;
  user: { nombre: string; cedula: string | null; zona: string };
};

type PreviewDisponibilidad = {
  id: string;
  fecha: string;
  valor: string;
  valorCop?: number;
  user: { nombre: string; cedula: string | null; zona: string; role: string };
};

type PreviewTurnoCoordinador = {
  id: string;
  fecha: string;
  horaEntrada: string;
  horaSalida: string | null;
  codigoOrden: string;
  heDiurna: number;
  heNocturna: number;
  heDominical: number;
  heNoctDominical: number;
  recNocturno: number;
  recDominical: number;
  recNoctDominical: number;
  horasOrdinarias: number;
  user: { nombre: string; cedula: string | null; zona: string; role: string };
};

type PreviewData = {
  turnos: PreviewTurno[];
  foraneos: PreviewForaneo[];
  disponibilidades: PreviewDisponibilidad[];
  turnosCoordinador?: PreviewTurnoCoordinador[];
};

type ReporteListItem = {
  id: string;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  zona: string | null;
  createdAt: string;
  creadoPorUser: { nombre: string };
  _count: {
    turnosIncluidos: number;
    foraneosIncluidos: number;
    disponibilidadesIncluidas: number;
    turnosCoordinadorIncluidos: number;
  };
};

function totalHE(t: PreviewTurno): number {
  return (
    (t.heDiurna ?? 0) +
    (t.heNocturna ?? 0) +
    (t.heDominical ?? 0) +
    (t.heNoctDominical ?? 0)
  );
}

function totalRecargos(t: PreviewTurno): number {
  return (t.recNocturno ?? 0) + (t.recDominical ?? 0) + (t.recNoctDominical ?? 0);
}

function totalHECoord(t: PreviewTurnoCoordinador): number {
  return (
    (t.heDiurna ?? 0) +
    (t.heNocturna ?? 0) +
    (t.heDominical ?? 0) +
    (t.heNoctDominical ?? 0)
  );
}

function totalRecargosCoord(t: PreviewTurnoCoordinador): number {
  return (t.recNocturno ?? 0) + (t.recDominical ?? 0) + (t.recNoctDominical ?? 0);
}

function totalHorasTrabajoCoord(t: PreviewTurnoCoordinador): number {
  return (t.horasOrdinarias ?? 0) + totalHECoord(t);
}

function kmForaneo(f: PreviewForaneo): number {
  if (f.kmInicial != null && f.kmFinal != null && f.kmFinal > f.kmInicial) {
    return f.kmFinal - f.kmInicial;
  }
  return 0;
}

function nombreSugerido(desde: string, hasta: string): string {
  try {
    const d1 = parseISO(desde);
    const d2 = parseISO(hasta);
    const mes1 = format(d1, "LLLL", { locale: es });
    const mes2 = format(d2, "LLLL", { locale: es });
    const y = format(d2, "yyyy");
    return `Reporte Mes ${mes1} - ${mes2} ${y}`;
  } catch {
    return "Reporte guardado";
  }
}

export default function ReportesGuardadosClient() {
  const { data: session, status } = useSession();
  const role = session?.user?.role ?? "";
  const isCoord = role === "COORDINADOR";

  const [desde, setDesde] = useState(() => format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"));
  const [hasta, setHasta] = useState(() => format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), "yyyy-MM-dd"));
  const [zonaFiltro, setZonaFiltro] = useState<"ALL" | "BOGOTA" | "COSTA" | "INTERIOR">("ALL");
  const [nombre, setNombre] = useState("");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [selTurnos, setSelTurnos] = useState<Set<string>>(new Set());
  const [selTurnosCoord, setSelTurnosCoord] = useState<Set<string>>(new Set());
  const [selForaneos, setSelForaneos] = useState<Set<string>>(new Set());
  const [selDisp, setSelDisp] = useState<Set<string>>(new Set());
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [reportes, setReportes] = useState<ReporteListItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const zonaQuery = useMemo(() => {
    if (isCoord) return "";
    return zonaFiltro === "ALL" ? "" : `&zona=${zonaFiltro}`;
  }, [isCoord, zonaFiltro]);

  const loadReportes = useCallback(async () => {
    setLoadingList(true);
    try {
      const q = isCoord ? "" : zonaFiltro === "ALL" ? "" : `?zona=${zonaFiltro}`;
      const res = await fetch(`/api/reportes/guardados${q}`);
      const data = await parseResponseJson<{ reportes: ReporteListItem[] }>(res);
      if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? "Error al cargar");
      setReportes(data?.reportes ?? []);
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Error al cargar reportes" });
    } finally {
      setLoadingList(false);
    }
  }, [isCoord, zonaFiltro]);

  useEffect(() => {
    if (status === "authenticated") loadReportes();
  }, [status, loadReportes]);

  const totalesPreview = useMemo(() => {
    if (!preview) {
      return { he: 0, recargos: 0, km: 0, monto: 0, diasDisp: 0, montoDisp: 0 };
    }
    let he = 0;
    let recargos = 0;
    let km = 0;
    let diasDisp = 0;
    let montoDisp = 0;
    preview.turnos.forEach((t) => {
      if (selTurnos.has(t.id)) {
        he += totalHE(t);
        recargos += totalRecargos(t);
      }
    });
    preview.foraneos.forEach((f) => {
      if (selForaneos.has(f.id)) {
        const k = kmForaneo(f);
        km += k;
      }
    });
    preview.disponibilidades.forEach((d) => {
      if (selDisp.has(d.id)) {
        diasDisp += 1;
        montoDisp += d.valorCop ?? VALOR_DISPONIBILIDAD_TECNICO;
      }
    });
    (preview.turnosCoordinador ?? []).forEach((t) => {
      if (selTurnosCoord.has(t.id)) {
        he += totalHECoord(t);
        recargos += totalRecargosCoord(t);
      }
    });
    return {
      he: Math.round(he * 100) / 100,
      recargos: Math.round(recargos * 100) / 100,
      km: Math.round(km * 100) / 100,
      monto: Math.round(km * TARIFA_KM),
      diasDisp,
      montoDisp,
    };
  }, [preview, selTurnos, selTurnosCoord, selForaneos, selDisp]);

  async function onVistaPrevia() {
    setMsg(null);
    setLoadingPreview(true);
    try {
      const res = await fetch(`/api/reportes/guardados/preview?desde=${desde}&hasta=${hasta}${zonaQuery}`);
      const data = await parseResponseJson<
        PreviewData & { disponibilidades?: PreviewDisponibilidad[]; turnosCoordinador?: PreviewTurnoCoordinador[] }
      >(res);
      if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? "Error en vista previa");
      if (!data) throw new Error("Respuesta vacía");
      const disponibilidades = data.disponibilidades ?? [];
      const turnosPv = data.turnos ?? [];
      const foraneosPv = data.foraneos ?? [];
      const turnosCoordPv = data.turnosCoordinador ?? [];
      setPreview({ turnos: turnosPv, foraneos: foraneosPv, disponibilidades, turnosCoordinador: turnosCoordPv });
      setSelTurnos(new Set(turnosPv.map((t) => t.id)));
      setSelTurnosCoord(new Set(turnosCoordPv.map((t) => t.id)));
      setSelForaneos(new Set(foraneosPv.map((f) => f.id)));
      setSelDisp(new Set(disponibilidades.map((d) => d.id)));
      if (!nombre.trim()) setNombre(nombreSugerido(desde, hasta));
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Error" });
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function onGuardar() {
    if (!preview) return;
    setMsg(null);
    setSaving(true);
    try {
      const body = {
        nombre: nombre.trim() || nombreSugerido(desde, hasta),
        fechaInicio: desde,
        fechaFin: hasta,
        zona: isCoord ? undefined : zonaFiltro,
        turnoIds: [...selTurnos],
        foraneoIds: [...selForaneos],
        disponibilidadIds: [...selDisp],
        turnoCoordinadorIds: [...selTurnosCoord],
      };
      const res = await fetch("/api/reportes/guardados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await parseResponseJson(res);
      if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? "No se pudo guardar");
      setMsg({
        type: "ok",
        text: "Reporte guardado. Los ítems incluidos no aparecerán en futuros reportes.",
      });
      setPreview(null);
      setSelTurnos(new Set());
      setSelTurnosCoord(new Set());
      setSelForaneos(new Set());
      setSelDisp(new Set());
      await loadReportes();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Error al guardar" });
    } finally {
      setSaving(false);
    }
  }

  async function onDescargarExcel(id: string) {
    window.location.href = `/api/reportes/guardados/${id}/excel`;
  }

  async function descargarCSV(id: string, nombreReporte: string) {
    setMsg(null);
    try {
      const res = await fetch(`/api/reportes/guardados/${id}/csv`);
      if (!res.ok) {
        const err = await parseResponseJson<{ error?: string }>(res);
        setMsg({ type: "err", text: err?.error ?? `Error ${res.status}` });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const base = nombreReporte.replace(/[/\\?%*:|"<>]/g, "-").trim().replace(/\.csv$/i, "") || "reporte";
      a.download = `${base}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Error al descargar CSV" });
    }
  }

  async function onConfirmarEliminar() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/reportes/guardados/${deleteId}`, { method: "DELETE" });
      const data = await parseResponseJson(res);
      if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? "No se pudo eliminar");
      setDeleteId(null);
      await loadReportes();
      setMsg({ type: "ok", text: "Reporte eliminado. Los ítems vuelven a estar disponibles." });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Error" });
    } finally {
      setDeleting(false);
    }
  }

  function toggleAllTurnos(checked: boolean) {
    if (!preview) return;
    setSelTurnos(checked ? new Set(preview.turnos.map((t) => t.id)) : new Set());
  }

  function toggleAllForaneos(checked: boolean) {
    if (!preview) return;
    setSelForaneos(checked ? new Set(preview.foraneos.map((f) => f.id)) : new Set());
  }

  function toggleAllDisponibilidades(checked: boolean) {
    if (!preview) return;
    setSelDisp(checked ? new Set(preview.disponibilidades.map((d) => d.id)) : new Set());
  }

  function toggleAllTurnosCoordinador(checked: boolean) {
    if (!preview) return;
    const list = preview.turnosCoordinador ?? [];
    setSelTurnosCoord(checked ? new Set(list.map((t) => t.id)) : new Set());
  }

  if (status === "loading") {
    return <div className="p-6 text-gray-600">Cargando…</div>;
  }

  if (status !== "authenticated") {
    return <div className="p-6 text-red-600">Debes iniciar sesión.</div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reportes guardados</h1>
        <p className="text-sm text-gray-600 mt-1">
          Genera reportes por rango, guarda los ítems seleccionados y descarga Excel o CSV. Turnos con HE/recargos,
          foráneos aprobados y días de disponibilidad en malla guardados no vuelven a aparecer hasta que elimines el
          reporte.
        </p>
      </div>

      {msg && (
        <div
          className={`rounded-lg px-4 py-3 text-sm flex items-center gap-2 ${
            msg.type === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {msg.type === "ok" && <HiCheckCircle className="h-5 w-5 shrink-0" />}
          {msg.text}
        </div>
      )}

      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Generar reporte</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nombre del reporte</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={nombreSugerido(desde, hasta)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
            <input
              type="date"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
            <input
              type="date"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </div>
          {!isCoord && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Zona</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={zonaFiltro}
                onChange={(e) => setZonaFiltro(e.target.value as "ALL" | "BOGOTA" | "COSTA" | "INTERIOR")}
              >
                <option value="ALL">Todas</option>
                <option value="BOGOTA">Bogotá</option>
                <option value="COSTA">Costa</option>
                <option value="INTERIOR">Interior</option>
              </select>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onVistaPrevia}
            disabled={loadingPreview}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
          >
            <HiRefresh className={`h-4 w-4 ${loadingPreview ? "animate-spin" : ""}`} />
            Vista previa
          </button>
          <button
            type="button"
            onClick={() => setNombre(nombreSugerido(desde, hasta))}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Usar nombre sugerido
          </button>
        </div>

        {preview && (
          <div className="space-y-8 pt-4 border-t border-gray-100">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-gray-900 dark:text-white">Horas extras / recargos</h3>
                <label className="text-sm text-gray-600 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={preview.turnos.length > 0 && selTurnos.size === preview.turnos.length}
                    onChange={(e) => toggleAllTurnos(e.target.checked)}
                  />
                  Seleccionar todos
                </label>
              </div>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="p-2 w-10" />
                      <th className="text-left p-2">Operador</th>
                      <th className="text-left p-2">Fecha</th>
                      <th className="text-right p-2">HE</th>
                      <th className="text-right p-2">Rec.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.turnos.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-gray-500">
                          No hay turnos disponibles en este rango
                        </td>
                      </tr>
                    ) : (
                      preview.turnos.map((t) => (
                        <tr key={t.id} className="border-t border-gray-100">
                          <td className="p-2">
                            <input
                              type="checkbox"
                              checked={selTurnos.has(t.id)}
                              onChange={(e) => {
                                const n = new Set(selTurnos);
                                if (e.target.checked) n.add(t.id);
                                else n.delete(t.id);
                                setSelTurnos(n);
                              }}
                            />
                          </td>
                          <td className="p-2">{t.user.nombre}</td>
                          <td className="p-2">{format(parseISO(t.fecha), "dd/MM/yyyy")}</td>
                          <td className="p-2 text-right font-mono">{totalHE(t).toFixed(2)}</td>
                          <td className="p-2 text-right font-mono">{totalRecargos(t).toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-gray-900 dark:text-white">Turnos coordinadores</h3>
                <label className="text-sm text-gray-600 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={(() => {
                      const list = preview.turnosCoordinador ?? [];
                      return list.length > 0 && selTurnosCoord.size === list.length;
                    })()}
                    onChange={(e) => toggleAllTurnosCoordinador(e.target.checked)}
                  />
                  Seleccionar todos
                </label>
              </div>
              <p className="text-sm text-gray-500 mb-2">
                Líderes de zona (campo e interior) con HE o recargos, no incluidos en reportes anteriores.
              </p>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="p-2 w-10" />
                      <th className="text-left p-2">Cédula</th>
                      <th className="text-left p-2">Nombre</th>
                      <th className="text-left p-2">Rol</th>
                      <th className="text-left p-2">Mes</th>
                      <th className="text-left p-2">Día</th>
                      <th className="text-left p-2">Fecha</th>
                      <th className="text-left p-2">Código / orden</th>
                      <th className="text-left p-2">Inicio</th>
                      <th className="text-left p-2">Fin</th>
                      <th className="text-right p-2">Total h.</th>
                      <th className="text-right p-2">HE Diur.</th>
                      <th className="text-right p-2">HE Noct.</th>
                      <th className="text-right p-2">HE Dom/F diur.</th>
                      <th className="text-right p-2">HE Dom/F noct.</th>
                      <th className="text-right p-2">Rec. noct.</th>
                      <th className="text-right p-2">Rec. Dom/F diur.</th>
                      <th className="text-right p-2">Rec. Dom/F noct.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(preview.turnosCoordinador ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={17} className="p-4 text-center text-gray-500">
                          No hay turnos de coordinador disponibles en este rango
                        </td>
                      </tr>
                    ) : (
                      (preview.turnosCoordinador ?? []).map((t) => (
                        <tr key={t.id} className="border-t border-gray-100">
                          <td className="p-2">
                            <input
                              type="checkbox"
                              checked={selTurnosCoord.has(t.id)}
                              onChange={(e) => {
                                const n = new Set(selTurnosCoord);
                                if (e.target.checked) n.add(t.id);
                                else n.delete(t.id);
                                setSelTurnosCoord(n);
                              }}
                            />
                          </td>
                          <td className="p-2 font-mono text-xs">{t.user.cedula ?? "—"}</td>
                          <td className="p-2">{t.user.nombre}</td>
                          <td className="p-2">{getRoleLabel(t.user.role)}</td>
                          <td className="p-2 capitalize">
                            {format(parseISO(t.fecha.split("T")[0]), "LLLL", { locale: es })}
                          </td>
                          <td className="p-2">{format(parseISO(t.fecha.split("T")[0]), "d", { locale: es })}</td>
                          <td className="p-2">{format(parseISO(t.fecha.split("T")[0]), "dd/MM/yyyy", { locale: es })}</td>
                          <td className="p-2 font-mono">{t.codigoOrden}</td>
                          <td className="p-2 whitespace-nowrap">
                            {format(parseISO(t.horaEntrada), "dd/MM/yyyy HH:mm", { locale: es })}
                          </td>
                          <td className="p-2 whitespace-nowrap">
                            {t.horaSalida
                              ? format(parseISO(t.horaSalida), "dd/MM/yyyy HH:mm", { locale: es })
                              : "—"}
                          </td>
                          <td className="p-2 text-right font-mono">{totalHorasTrabajoCoord(t).toFixed(2)}</td>
                          <td className="p-2 text-right font-mono">{(t.heDiurna ?? 0).toFixed(2)}</td>
                          <td className="p-2 text-right font-mono">{(t.heNocturna ?? 0).toFixed(2)}</td>
                          <td className="p-2 text-right font-mono">{(t.heDominical ?? 0).toFixed(2)}</td>
                          <td className="p-2 text-right font-mono">{(t.heNoctDominical ?? 0).toFixed(2)}</td>
                          <td className="p-2 text-right font-mono">{(t.recNocturno ?? 0).toFixed(2)}</td>
                          <td className="p-2 text-right font-mono">{(t.recDominical ?? 0).toFixed(2)}</td>
                          <td className="p-2 text-right font-mono">{(t.recNoctDominical ?? 0).toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-gray-900 dark:text-white">Foráneos aprobados</h3>
                <label className="text-sm text-gray-600 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={preview.foraneos.length > 0 && selForaneos.size === preview.foraneos.length}
                    onChange={(e) => toggleAllForaneos(e.target.checked)}
                  />
                  Seleccionar todos
                </label>
              </div>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="p-2 w-10" />
                      <th className="text-left p-2">Operador</th>
                      <th className="text-left p-2">Fecha registro</th>
                      <th className="text-right p-2">Km</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.foraneos.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-gray-500">
                          No hay foráneos aprobados disponibles en este rango
                        </td>
                      </tr>
                    ) : (
                      preview.foraneos.map((f) => (
                        <tr key={f.id} className="border-t border-gray-100">
                          <td className="p-2">
                            <input
                              type="checkbox"
                              checked={selForaneos.has(f.id)}
                              onChange={(e) => {
                                const n = new Set(selForaneos);
                                if (e.target.checked) n.add(f.id);
                                else n.delete(f.id);
                                setSelForaneos(n);
                              }}
                            />
                          </td>
                          <td className="p-2">{f.user.nombre}</td>
                          <td className="p-2">{format(parseISO(f.createdAt), "dd/MM/yyyy HH:mm")}</td>
                          <td className="p-2 text-right font-mono">{kmForaneo(f).toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-gray-900 dark:text-white">Disponibilidades</h3>
                <label className="text-sm text-gray-600 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={
                      preview.disponibilidades.length > 0 &&
                      selDisp.size === preview.disponibilidades.length
                    }
                    onChange={(e) => toggleAllDisponibilidades(e.target.checked)}
                  />
                  Seleccionar todos
                </label>
              </div>
              <p className="text-sm text-gray-500 mb-2">
                Días con &quot;disponible&quot; en la malla. Operador:{" "}
                {VALOR_DISPONIBILIDAD_TECNICO.toLocaleString("es-CO")} COP/día · Líder de zona: 110.000 COP/día.
              </p>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="p-2 w-10" />
                      <th className="text-left p-2">Cédula</th>
                      <th className="text-left p-2">Nombre</th>
                      <th className="text-left p-2">Rol</th>
                      <th className="text-left p-2">Fecha</th>
                      <th className="text-left p-2">Malla</th>
                      <th className="text-right p-2">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.disponibilidades.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-4 text-center text-gray-500">
                          No hay disponibilidades disponibles en este rango
                        </td>
                      </tr>
                    ) : (
                      preview.disponibilidades.map((d) => (
                        <tr key={d.id} className="border-t border-gray-100">
                          <td className="p-2">
                            <input
                              type="checkbox"
                              checked={selDisp.has(d.id)}
                              onChange={(e) => {
                                const n = new Set(selDisp);
                                if (e.target.checked) n.add(d.id);
                                else n.delete(d.id);
                                setSelDisp(n);
                              }}
                            />
                          </td>
                          <td className="p-2 font-mono text-xs">{d.user.cedula ?? "—"}</td>
                          <td className="p-2">{d.user.nombre}</td>
                          <td className="p-2 text-xs">{getRoleLabel(d.user.role)}</td>
                          <td className="p-2">{format(parseISO(d.fecha), "dd/MM/yyyy")}</td>
                          <td className="p-2 max-w-[200px] truncate" title={d.valor}>
                            {d.valor}
                          </td>
                          <td className="p-2 text-right">
                            ${(d.valorCop ?? VALOR_DISPONIBILIDAD_TECNICO).toLocaleString("es-CO")}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-700 space-y-1">
                <div>
                  <span className="font-medium">Total HE (selección):</span> {totalesPreview.he}
                </div>
                <div>
                  <span className="font-medium">Total recargos (selección):</span> {totalesPreview.recargos}
                </div>
                <div>
                  <span className="font-medium">Total km foráneos (selección):</span> {totalesPreview.km}
                </div>
                <div>
                  <span className="font-medium">Total a pagar foráneos (× {TARIFA_KM}):</span> $
                  {totalesPreview.monto.toLocaleString("es-CO")}
                </div>
                <div>
                  <span className="font-medium">Disponibilidades (selección):</span> {totalesPreview.diasDisp} días — total
                  estimado ${totalesPreview.montoDisp.toLocaleString("es-CO")} (según rol por fila)
                </div>
              </div>
              <button
                type="button"
                onClick={onGuardar}
                disabled={
                  saving ||
                  (selTurnos.size === 0 &&
                    selTurnosCoord.size === 0 &&
                    selForaneos.size === 0 &&
                    selDisp.size === 0)
                }
                className="px-5 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Guardar reporte"}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Reportes guardados</h2>
          {!isCoord && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Filtrar lista</span>
              <select
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                value={zonaFiltro}
                onChange={(e) => setZonaFiltro(e.target.value as "ALL" | "BOGOTA" | "COSTA" | "INTERIOR")}
              >
                <option value="ALL">Todas las zonas</option>
                <option value="BOGOTA">Bogotá</option>
                <option value="COSTA">Costa</option>
                <option value="INTERIOR">Interior</option>
              </select>
            </div>
          )}
        </div>

        {loadingList ? (
          <p className="text-gray-500 text-sm">Cargando…</p>
        ) : reportes.length === 0 ? (
          <p className="text-gray-500 text-sm">No hay reportes guardados.</p>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left p-2">Nombre</th>
                  <th className="text-left p-2">Rango</th>
                  <th className="text-left p-2">Zona</th>
                  <th className="text-right p-2">Turnos</th>
                  <th className="text-right p-2">Líder</th>
                  <th className="text-right p-2">Foráneos</th>
                  <th className="text-right p-2">Disp.</th>
                  <th className="text-left p-2">Creado</th>
                  <th className="text-left p-2">Por</th>
                  <th className="p-2 w-40">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {reportes.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="p-2 font-medium text-gray-900 dark:text-white">{r.nombre}</td>
                    <td className="p-2 whitespace-nowrap">
                      {format(parseISO(r.fechaInicio), "dd/MM/yy")} – {format(parseISO(r.fechaFin), "dd/MM/yy")}
                    </td>
                    <td className="p-2">{r.zona ? getZonaLabel(r.zona) : "Todas"}</td>
                    <td className="p-2 text-right">{r._count.turnosIncluidos}</td>
                    <td className="p-2 text-right">{r._count.turnosCoordinadorIncluidos ?? 0}</td>
                    <td className="p-2 text-right">{r._count.foraneosIncluidos}</td>
                    <td className="p-2 text-right">{r._count.disponibilidadesIncluidas ?? 0}</td>
                    <td className="p-2 whitespace-nowrap">{format(parseISO(r.createdAt), "dd/MM/yyyy HH:mm")}</td>
                    <td className="p-2">{r.creadoPorUser.nombre}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1 items-center">
                        <button
                          type="button"
                          title="Descargar Excel"
                          onClick={() => onDescargarExcel(r.id)}
                          className="p-2 rounded-lg text-primary-600 hover:bg-primary-50"
                        >
                          <HiDownload className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          title="Descargar CSV"
                          onClick={() => void descargarCSV(r.id, r.nombre)}
                          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-gray-700 hover:bg-gray-100 text-xs font-medium"
                        >
                          <HiDocumentText className="h-4 w-4" />
                          CSV
                        </button>
                        <button
                          type="button"
                          title="Eliminar"
                          onClick={() => setDeleteId(r.id)}
                          className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                        >
                          <HiTrash className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">¿Eliminar reporte?</h3>
            <p className="text-sm text-gray-600">
              Los turnos (operadores y líderes de zona), foráneos y disponibilidades incluidos volverán a estar disponibles
              para futuros reportes.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm"
                onClick={() => setDeleteId(null)}
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-50"
                onClick={onConfirmarEliminar}
                disabled={deleting}
              >
                {deleting ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
