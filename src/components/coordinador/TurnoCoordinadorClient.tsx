"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseResponseJson } from "@/lib/parseFetchJson";
import { formatFechaTurnoDdMmmYyyy } from "@/lib/formatFechaTurno";
import { HiClock, HiPlay, HiStop } from "react-icons/hi";
import CoordinadorDisponibilidadTab from "@/components/coordinador/CoordinadorDisponibilidadTab";

export type TurnoCoordinadorRow = {
  id: string;
  userId?: string;
  fecha: string;
  horaEntrada: string;
  horaSalida: string | null;
  codigoOrden: string;
  horasOrdinarias: number;
  heDiurna: number;
  heNocturna: number;
  heDominical: number;
  heNoctDominical: number;
  recNocturno: number;
  recDominical: number;
  recNoctDominical: number;
  nota?: string | null;
  user?: { nombre: string; cedula: string | null; zona: string; role: string };
};

function totalHE(t: Pick<TurnoCoordinadorRow, keyof TurnoCoordinadorRow>): number {
  return (
    (t.heDiurna ?? 0) +
    (t.heNocturna ?? 0) +
    (t.heDominical ?? 0) +
    (t.heNoctDominical ?? 0)
  );
}

function totalHorasTrabajo(t: TurnoCoordinadorRow): number {
  return (t.horasOrdinarias ?? 0) + totalHE(t);
}

function obtenerGps(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60_000 }
    );
  });
}

type Props = { titulo?: string };

export default function TurnoCoordinadorClient({ titulo = "Turno Coordinador" }: Props) {
  const [desdeHist, setDesdeHist] = useState(() =>
    format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd")
  );
  const [hastaHist, setHastaHist] = useState(() =>
    format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), "yyyy-MM-dd")
  );
  const [turnosHist, setTurnosHist] = useState<TurnoCoordinadorRow[]>([]);
  const [turnoAbierto, setTurnoAbierto] = useState<TurnoCoordinadorRow | null>(null);
  const [loadingHist, setLoadingHist] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [modalInicio, setModalInicio] = useState(false);
  const [codigoOrdenInput, setCodigoOrdenInput] = useState("");
  const [accionLoading, setAccionLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [tick, setTick] = useState(0);

  const cargarHistorial = useCallback(async () => {
    setLoadingHist(true);
    try {
      const q = new URLSearchParams({ desde: desdeHist, hasta: hastaHist });
      const res = await fetch(`/api/turnos-coordinador?${q}`);
      const data = await parseResponseJson<{ turnos: TurnoCoordinadorRow[] }>(res);
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Error al cargar turnos");
      setTurnosHist(Array.isArray(data?.turnos) ? data.turnos : []);
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Error" });
      setTurnosHist([]);
    } finally {
      setLoadingHist(false);
    }
  }, [desdeHist, hastaHist]);

  const cargarTurnoAbierto = useCallback(async () => {
    try {
      const res = await fetch("/api/turnos-coordinador");
      const data = await parseResponseJson<{ turnos: TurnoCoordinadorRow[] }>(res);
      if (!res.ok) return;
      const list = Array.isArray(data?.turnos) ? data.turnos : [];
      setTurnoAbierto(list.find((t) => t.horaSalida == null) ?? null);
    } catch {
      setTurnoAbierto(null);
    }
  }, []);

  useEffect(() => {
    void cargarHistorial();
  }, [cargarHistorial, refreshKey]);

  useEffect(() => {
    void cargarTurnoAbierto();
  }, [cargarTurnoAbierto, refreshKey]);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedLabel = useMemo(() => {
    if (!turnoAbierto) return "";
    const start = new Date(turnoAbierto.horaEntrada).getTime();
    const sec = Math.max(0, Math.floor((Date.now() - start) / 1000));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
  }, [turnoAbierto, tick]);

  async function onIniciarTurno() {
    const codigo = codigoOrdenInput.trim();
    if (!codigo) {
      setMsg({ type: "err", text: "El código u orden de trabajo es obligatorio" });
      return;
    }
    setAccionLoading(true);
    setMsg(null);
    try {
      const gps = await obtenerGps();
      const res = await fetch("/api/turnos-coordinador", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigoOrden: codigo,
          ...(gps ? { lat: gps.lat, lng: gps.lng } : {}),
        }),
      });
      const data = await parseResponseJson(res);
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? "No se pudo iniciar el turno");
      setModalInicio(false);
      setCodigoOrdenInput("");
      setMsg({
        type: "ok",
        text: `Turno iniciado — Código: ${codigo}`,
      });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Error" });
    } finally {
      setAccionLoading(false);
    }
  }

  async function onFinalizarTurno(id: string) {
    setAccionLoading(true);
    setMsg(null);
    try {
      const gps = await obtenerGps();
      const res = await fetch(`/api/turnos-coordinador/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gps ? { lat: gps.lat, lng: gps.lng } : {}),
      });
      const data = await parseResponseJson(res);
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? "No se pudo finalizar");
      setMsg({ type: "ok", text: "Turno finalizado correctamente" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Error" });
    } finally {
      setAccionLoading(false);
    }
  }

  const cerradosOrdenados = useMemo(
    () => turnosHist.filter((t) => t.horaSalida != null),
    [turnosHist]
  );

  const [tab, setTab] = useState<"fichaje" | "dispo">("fichaje");

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{titulo}</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-[#A0AEC0]">
          Registra inicio y fin de jornada con el código u orden de trabajo asignado.
        </p>
      </div>

      <div className="flex gap-2 border-b border-gray-200 dark:border-[#3A4565]">
        <button
          type="button"
          onClick={() => setTab("fichaje")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "fichaje"
              ? "border-primary-600 text-primary-700 dark:border-[#00D4AA] dark:text-[#00D4AA]"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-[#A0AEC0] dark:hover:text-white"
          }`}
        >
          Fichaje e historial
        </button>
        <button
          type="button"
          onClick={() => setTab("dispo")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "dispo"
              ? "border-primary-600 text-primary-700 dark:border-[#00D4AA] dark:text-[#00D4AA]"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-[#A0AEC0] dark:hover:text-white"
          }`}
        >
          Disponibilidad
        </button>
      </div>

      {msg && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            msg.type === "ok"
              ? "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200"
              : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200"
          }`}
        >
          {msg.text}
        </div>
      )}

      {tab === "dispo" && (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[#3A4565] dark:bg-[#1A2340] dark:shadow-black/30">
          <CoordinadorDisponibilidadTab />
        </section>
      )}

      {tab === "fichaje" && (
        <>
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[#3A4565] dark:bg-[#1A2340] dark:shadow-black/30">
        <div className="mb-4 flex items-center gap-2 text-primary-700 dark:text-[#00D4AA]">
          <HiClock className="h-6 w-6" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Fichaje</h2>
        </div>

        {!turnoAbierto ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <button
              type="button"
              disabled={accionLoading}
              onClick={() => {
                setCodigoOrdenInput("");
                setModalInicio(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-8 py-4 text-lg font-semibold text-white shadow-md hover:bg-primary-700 disabled:opacity-50"
            >
              <HiPlay className="h-7 w-7" />
              Iniciar turno
            </button>
            <p className="text-center text-sm text-gray-500 dark:text-[#A0AEC0]">
              Se solicitará el código u orden de trabajo y, si aceptas, la ubicación en el navegador.
            </p>
          </div>
        ) : (
          <div className="space-y-4 rounded-lg border border-primary-100 bg-primary-50/40 p-5 dark:border-[#3A4565] dark:bg-[#1A2340]">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <span className="font-medium text-gray-700 dark:text-[#CBD5E1]">Código / orden:</span>{" "}
                <span className="font-mono text-gray-900 dark:text-white">{turnoAbierto.codigoOrden}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700 dark:text-[#CBD5E1]">Inicio:</span>{" "}
                {new Date(turnoAbierto.horaEntrada).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric" })}{" "}
                {new Date(turnoAbierto.horaEntrada).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })}
              </div>
              <div className="sm:col-span-2">
                <span className="font-medium text-gray-700 dark:text-[#CBD5E1]">Tiempo transcurrido:</span>{" "}
                <span className="font-mono text-lg text-primary-800">{elapsedLabel}</span>
              </div>
            </div>
            <button
              type="button"
              disabled={accionLoading}
              onClick={() => void onFinalizarTurno(turnoAbierto.id)}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              <HiStop className="h-5 w-5" />
              Finalizar turno
            </button>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[#3A4565] dark:bg-[#1A2340] dark:shadow-black/30">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Historial</h2>
        <div className="mb-4 flex flex-wrap gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-[#A0AEC0]">Desde</label>
            <input
              type="date"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-[#3A4565] dark:bg-[#1E2A45] dark:text-white"
              value={desdeHist}
              onChange={(e) => setDesdeHist(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-[#A0AEC0]">Hasta</label>
            <input
              type="date"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-[#3A4565] dark:bg-[#1E2A45] dark:text-white"
              value={hastaHist}
              onChange={(e) => setHastaHist(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-[#3A4565] dark:text-white dark:hover:bg-bia-navy-500"
            >
              Actualizar
            </button>
          </div>
        </div>

        {loadingHist ? (
          <p className="text-sm text-gray-500 dark:text-[#A0AEC0]">Cargando…</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-[#3A4565]">
            <table className="min-w-full text-xs sm:text-sm">
              <thead className="bg-gray-50 text-gray-600 dark:bg-[#162035] dark:text-[#A0AEC0]">
                <tr>
                  <th className="p-2 text-left">Fecha</th>
                  <th className="p-2 text-left">Código / orden</th>
                  <th className="p-2 text-left">Entrada</th>
                  <th className="p-2 text-left">Salida</th>
                  <th className="p-2 text-right">Total h.</th>
                  <th className="p-2 text-right">HE Diur.</th>
                  <th className="p-2 text-right">HE Noct.</th>
                  <th className="p-2 text-right">HE Dom/F diur.</th>
                  <th className="p-2 text-right">HE Dom/F noct.</th>
                  <th className="p-2 text-right">Rec. noct.</th>
                  <th className="p-2 text-right">Rec. Dom/F diur.</th>
                  <th className="p-2 text-right">Rec. Dom/F noct.</th>
                </tr>
              </thead>
              <tbody>
                {cerradosOrdenados.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="p-6 text-center text-gray-500 dark:text-[#A0AEC0]">
                      No hay turnos cerrados en el rango.
                    </td>
                  </tr>
                ) : (
                  cerradosOrdenados.map((t) => (
                    <tr key={t.id} className="border-t border-gray-100 dark:border-[#2A3555] hover:bg-gray-50 dark:hover:bg-[#243052]">
                      <td className="p-2 whitespace-nowrap">{formatFechaTurnoDdMmmYyyy(t.fecha)}</td>
                      <td className="p-2 font-mono">{t.codigoOrden}</td>
                      <td className="p-2 whitespace-nowrap">
                        {new Date(t.horaEntrada).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {t.horaSalida
                          ? new Date(t.horaSalida).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </td>
                      <td className="p-2 text-right font-mono">{totalHorasTrabajo(t).toFixed(2)}</td>
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
        )}
      </section>
        </>
      )}

      {modalInicio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-[#1A2340] p-6 shadow-xl dark:shadow-black/40 border border-gray-200 dark:border-[#3A4565]">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Código u orden de trabajo</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-[#A0AEC0]">Obligatorio para iniciar el turno.</p>
            <input
              className="input-field mt-4 w-full"
              autoFocus
              value={codigoOrdenInput}
              onChange={(e) => setCodigoOrdenInput(e.target.value)}
              placeholder="Ej. OT-12345"
            />
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={accionLoading}
                onClick={() => setModalInicio(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={accionLoading}
                onClick={() => void onIniciarTurno()}
              >
                {accionLoading ? "Iniciando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
