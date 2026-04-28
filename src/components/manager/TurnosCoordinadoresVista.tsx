"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-provider";
import { format } from "date-fns";
import { parseResponseJson } from "@/lib/parseFetchJson";
import { formatFechaTurnoDdMmmYyyy } from "@/lib/formatFechaTurno";
import type { TurnoCoordinadorRow } from "@/components/coordinador/TurnoCoordinadorClient";
import { HiPencil, HiTrash } from "react-icons/hi";
import { getRoleLabel, getZonaLabel } from "@/lib/roleLabels";

function totalHE(t: TurnoCoordinadorRow): number {
  return (
    (t.daytimeOvertimeHours ?? 0) +
    (t.nighttimeOvertimeHours ?? 0) +
    (t.sundayOvertimeHours ?? 0) +
    (t.nightSundayOvertimeHours ?? 0)
  );
}

function totalRec(t: TurnoCoordinadorRow): number {
  return (t.nightSurchargeHours ?? 0) + (t.sundaySurchargeHours ?? 0) + (t.nightSundaySurchargeHours ?? 0);
}

function toDatetimeLocalValue(iso: string): string {
  const col = new Date(new Date(iso).getTime() - 5 * 60 * 60 * 1000);
  return col.toISOString().slice(0, 16);
}

export default function TurnosCoordinadoresVista() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "MANAGER" || profile?.role === "ADMIN";

  const [desde, setDesde] = useState(() =>
    format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd")
  );
  const [hasta, setHasta] = useState(() =>
    format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), "yyyy-MM-dd")
  );
  const [zona, setZona] = useState<"ALL" | "BOGOTA" | "COSTA" | "INTERIOR">("ALL");
  const [userIdFiltro, setUserIdFiltro] = useState("");
  const [rows, setRows] = useState<TurnoCoordinadorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editRow, setEditRow] = useState<TurnoCoordinadorRow | null>(null);
  const [formEntrada, setFormEntrada] = useState("");
  const [formSalida, setFormSalida] = useState("");
  const [formCodigo, setFormCodigo] = useState("");
  const [formNota, setFormNota] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteRow, setDeleteRow] = useState<TurnoCoordinadorRow | null>(null);
  const [deleting, setDeleting] = useState(false);

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
          if (t.userId && t.user?.fullName) m.set(t.userId, t.user.fullName);
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

  function abrirEditar(t: TurnoCoordinadorRow) {
    setEditRow(t);
    setFormEntrada(toDatetimeLocalValue(t.clockInAt));
    setFormSalida(t.clockOutAt ? toDatetimeLocalValue(t.clockOutAt) : "");
    setFormCodigo(t.orderCode);
    setFormNota((t as TurnoCoordinadorRow & { note?: string | null }).note ?? "");
  }

  async function guardarEdicion() {
    if (!editRow) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        clockInAt: new Date(formEntrada).toISOString(),
        orderCode: formCodigo.trim(),
        note: formNota.trim() || null,
      };
      if (formSalida.trim()) {
        body.clockOutAt = new Date(formSalida).toISOString();
      } else {
        body.clockOutAt = null;
      }
      const res = await fetch(`/api/turnos-coordinador/${editRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await parseResponseJson(res);
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? "No se pudo guardar");
      setEditRow(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function confirmarEliminar() {
    if (!deleteRow) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/turnos-coordinador/${deleteRow.id}`, { method: "DELETE" });
      const data = await parseResponseJson(res);
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? "No se pudo eliminar");
      setDeleteRow(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Turnos coordinadores</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-[#A0AEC0]">
          Turnos de líderes de zona en campo e interior (cerrados y abiertos) según filtros.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 rounded-xl border border-gray-200 dark:border-[#3A4565] bg-white dark:bg-[#1A2340] p-4 shadow-sm dark:shadow-black/30">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-[#A0AEC0]">Desde</label>
          <input
            type="date"
            className="rounded-lg border border-gray-300 dark:border-[#3A4565] px-3 py-2 text-sm dark:bg-[#1E2A45] dark:text-white"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-[#A0AEC0]">Hasta</label>
          <input
            type="date"
            className="rounded-lg border border-gray-300 dark:border-[#3A4565] px-3 py-2 text-sm dark:bg-[#1E2A45] dark:text-white"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-[#A0AEC0]">Zona</label>
          <select
            className="rounded-lg border border-gray-300 dark:border-[#3A4565] px-3 py-2 text-sm dark:bg-[#1E2A45] dark:text-white"
            value={zona}
            onChange={(e) => setZona(e.target.value as typeof zona)}
          >
            <option value="ALL">Todas</option>
            <option value="BOGOTA">Bogotá</option>
            <option value="COSTA">Costa</option>
            <option value="INTERIOR">Interior</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-[#A0AEC0]">Usuario</label>
          <select
            className="min-w-[200px] rounded-lg border border-gray-300 dark:border-[#3A4565] px-3 py-2 text-sm dark:bg-[#1E2A45] dark:text-white"
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
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-[#3A4565] bg-white dark:bg-[#1A2340] shadow-sm dark:shadow-black/30">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-[#162035] text-gray-600 dark:text-[#A0AEC0]">
              <tr>
                {canEdit && <th className="p-2 w-24 text-left">Acciones</th>}
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
                  <td colSpan={canEdit ? 12 : 11} className="p-8 text-center text-gray-500 dark:text-[#A0AEC0]">
                    No hay turnos en el rango.
                  </td>
                </tr>
              ) : (
                rows.map((t) => (
                  <tr key={t.id} className="border-t border-gray-100 dark:border-[#2A3555] hover:bg-gray-50 dark:hover:bg-[#243052]">
                    {canEdit && (
                      <td className="p-2">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            title="Editar"
                            onClick={() => abrirEditar(t)}
                            className="rounded-lg p-2 text-primary-600 hover:bg-primary-50"
                          >
                            <HiPencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Eliminar"
                            onClick={() => setDeleteRow(t)}
                            className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                          >
                            <HiTrash className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                    <td className="p-2 text-gray-900 dark:text-white">{t.user?.fullName ?? "—"}</td>
                    <td className="p-2 font-mono text-xs text-gray-800 dark:text-[#CBD5E1]">{t.user?.documentNumber ?? "—"}</td>
                    <td className="p-2 text-gray-800 dark:text-[#CBD5E1]">{t.user?.role ? getRoleLabel(t.user.role) : "—"}</td>
                    <td className="p-2 text-gray-800 dark:text-[#CBD5E1]">{t.user?.zone ? getZonaLabel(t.user.zone) : "—"}</td>
                    <td className="p-2 whitespace-nowrap text-gray-800 dark:text-white">{formatFechaTurnoDdMmmYyyy(t.date)}</td>
                    <td className="p-2 font-mono text-gray-800 dark:text-white">{t.orderCode}</td>
                    <td className="p-2 whitespace-nowrap text-gray-800 dark:text-white">
                      {new Date(t.clockInAt).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="p-2 whitespace-nowrap text-gray-800 dark:text-white">
                      {t.clockOutAt ? (
                        new Date(t.clockOutAt).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                      ) : (
                        <span className="font-medium text-amber-700">Abierto</span>
                      )}
                    </td>
                    <td className="p-2 text-right font-mono text-gray-800 dark:text-white">
                      {t.clockOutAt ? ((t.regularHours ?? 0) + totalHE(t)).toFixed(2) : "—"}
                    </td>
                    <td className="p-2 text-right font-mono text-gray-800 dark:text-white">{totalHE(t).toFixed(2)}</td>
                    <td className="p-2 text-right font-mono text-gray-800 dark:text-white">{totalRec(t).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white dark:bg-[#1A2340] p-6 shadow-xl dark:shadow-black/40 border border-gray-200 dark:border-[#3A4565]">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Editar turno coordinador</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-[#A0AEC0]">{editRow.user?.fullName}</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-[#A0AEC0]">Hora entrada</label>
                <input
                  type="datetime-local"
                  className="input-field mt-1 w-full"
                  value={formEntrada}
                  onChange={(e) => setFormEntrada(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-[#A0AEC0]">Hora salida (vacío = abierto)</label>
                <input
                  type="datetime-local"
                  className="input-field mt-1 w-full"
                  value={formSalida}
                  onChange={(e) => setFormSalida(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-[#A0AEC0]">Código / orden</label>
                <input
                  className="input-field mt-1 w-full"
                  value={formCodigo}
                  onChange={(e) => setFormCodigo(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-[#A0AEC0]">Nota (opcional)</label>
                <textarea
                  className="input-field mt-1 w-full min-h-[72px]"
                  value={formNota}
                  onChange={(e) => setFormNota(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={saving}
                onClick={() => setEditRow(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={saving || !formEntrada}
                onClick={() => void guardarEdicion()}
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-[#1A2340] p-6 shadow-xl dark:shadow-black/40 border border-gray-200 dark:border-[#3A4565]">
            <h3 className="font-semibold text-gray-900 dark:text-white">¿Eliminar turno?</h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-[#A0AEC0]">
              ¿Eliminar este turno de <strong>{deleteRow.user?.fullName}</strong>? Esta acción no se puede
              deshacer.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={deleting}
                onClick={() => setDeleteRow(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                disabled={deleting}
                onClick={() => void confirmarEliminar()}
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
