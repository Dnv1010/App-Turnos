"use client";

import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { parseResponseJson } from "@/lib/parseFetchJson";
import { formatFechaTurnoDdMmmYyyy } from "@/lib/formatFechaTurno";
import type { TurnoCoordinadorRow } from "@/components/coordinador/TurnoCoordinadorClient";

function totalHE(t: TurnoCoordinadorRow): number {
  return (
    (t.heDiurna ?? 0) +
    (t.heNocturna ?? 0) +
    (t.heDominical ?? 0) +
    (t.heNoctDominical ?? 0)
  );
}

function totalRec(t: TurnoCoordinadorRow): number {
  return (t.recNocturno ?? 0) + (t.recDominical ?? 0) + (t.recNoctDominical ?? 0);
}

function rolLabel(role: string | undefined): string {
  if (role === "COORDINADOR_INTERIOR") return "Coord. interior";
  if (role === "COORDINADOR") return "Coordinador";
  return role ?? "—";
}

export default function TurnosCoordinadoresVista() {
  const [desde, setDesde] = useState(() =>
    format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd")
  );
  const [hasta, setHasta] = useState(() =>
    format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), "yyyy-MM-dd")
  );
  const [zona, setZona] = useState<"ALL" | "BOGOTA" | "COSTA">("ALL");
  const [userIdFiltro, setUserIdFiltro] = useState("");
  const [rows, setRows] = useState<TurnoCoordinadorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ desde, hasta });
      if (zona !== "ALL") q.set("zona", zona);
      if (userIdFiltro.trim()) q.set("userId", userIdFiltro.trim());
      const res = await fetch(`/api/turnos-coordinador?${q}`);
      const data = await parseResponseJson<{ turnos: TurnoCoordinadorRow[] }>(res);
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Error al cargar");
      setRows(Array.isArray(data?.turnos) ? data.turnos : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, zona, userIdFiltro]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const [usuariosPick, setUsuariosPick] = useState<{ id: string; nombre: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const q = new URLSearchParams({ desde, hasta });
        if (zona !== "ALL") q.set("zona", zona);
        const res = await fetch(`/api/turnos-coordinador?${q}`);
        const data = await parseResponseJson<{ turnos: TurnoCoordinadorRow[] }>(res);
        if (!res.ok || cancelled) return;
        const list = data?.turnos ?? [];
        const m = new Map<string, string>();
        list.forEach((t) => {
          if (t.userId && t.user?.nombre) m.set(t.userId, t.user.nombre);
        });
        setUsuariosPick(
          [...m.entries()]
            .map(([id, nombre]) => ({ id, nombre }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre))
        );
      } catch {
        if (!cancelled) setUsuariosPick([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [desde, hasta, zona]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Turnos coordinadores</h2>
        <p className="mt-1 text-sm text-gray-600">
          Turnos de coordinadores y coordinador interior (cerrados y abiertos) según filtros.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Desde</label>
          <input
            type="date"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Hasta</label>
          <input
            type="date"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Zona</label>
          <select
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={zona}
            onChange={(e) => setZona(e.target.value as typeof zona)}
          >
            <option value="ALL">Todas</option>
            <option value="BOGOTA">Bogotá</option>
            <option value="COSTA">Costa</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Usuario</label>
          <select
            className="min-w-[200px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={userIdFiltro}
            onChange={(e) => setUserIdFiltro(e.target.value)}
          >
            <option value="">Todos</option>
            {usuariosPick.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => void cargar()}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Consultar
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="p-2 text-left">Nombre</th>
                <th className="p-2 text-left">Cédula</th>
                <th className="p-2 text-left">Rol</th>
                <th className="p-2 text-left">Zona</th>
                <th className="p-2 text-left">Fecha</th>
                <th className="p-2 text-left">Código / orden</th>
                <th className="p-2 text-left">Inicio</th>
                <th className="p-2 text-left">Fin</th>
                <th className="p-2 text-right">Total h.</th>
                <th className="p-2 text-right">HE</th>
                <th className="p-2 text-right">Recargos</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-gray-500">
                    No hay turnos en el rango.
                  </td>
                </tr>
              ) : (
                rows.map((t) => (
                  <tr key={t.id} className="border-t border-gray-100">
                    <td className="p-2">{t.user?.nombre ?? "—"}</td>
                    <td className="p-2 font-mono text-xs">{t.user?.cedula ?? "—"}</td>
                    <td className="p-2">{rolLabel(t.user?.role)}</td>
                    <td className="p-2">{t.user?.zona ?? "—"}</td>
                    <td className="p-2 whitespace-nowrap">{formatFechaTurnoDdMmmYyyy(t.fecha)}</td>
                    <td className="p-2 font-mono">{t.codigoOrden}</td>
                    <td className="p-2 whitespace-nowrap">
                      {format(parseISO(t.horaEntrada), "dd/MM/yyyy HH:mm", { locale: es })}
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      {t.horaSalida
                        ? format(parseISO(t.horaSalida), "dd/MM/yyyy HH:mm", { locale: es })
                        : <span className="text-amber-700 font-medium">Abierto</span>}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {t.horaSalida
                        ? ((t.horasOrdinarias ?? 0) + totalHE(t)).toFixed(2)
                        : "—"}
                    </td>
                    <td className="p-2 text-right font-mono">{totalHE(t).toFixed(2)}</td>
                    <td className="p-2 text-right font-mono">{totalRec(t).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
