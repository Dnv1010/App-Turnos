"use client";

import { useAuth } from "@/lib/auth-provider";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { formatFechaTurnoDdMmmYyyy } from "@/lib/formatFechaTurno";
import { parseResponseJson } from "@/lib/parseFetchJson";
import { useToast } from "@/components/ui/Toast";
import {
  HiSearch,
  HiPencil,
  HiTrash,
  HiX,
  HiSave,
  HiCheck,
  HiBan,
} from "react-icons/hi";

export type ForaneoRow = {
  id: string;
  fullName: string;
  documentNumber: string;
  zone: string;
  createdAt: string;
  startKm: number | null;
  endKm: number | null;
  kmRecorridos: number | null;
  driveUrl: string | null;
  driveUrlFinal: string | null;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  notes: string | null;
  approvalStatus: "PENDIENTE" | "APROBADA" | "NO_APROBADA";
  approvedBy: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
};

type EstadoFiltro = "ALL" | "PENDIENTE" | "APROBADA" | "NO_APROBADA";

function badgeEstado(e: ForaneoRow["approvalStatus"]) {
  if (e === "APROBADA")
    return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-[#00D4AA20] dark:text-[#00D4AA]">Aprobada</span>;
  if (e === "NO_APROBADA")
    return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-[#F8717120] dark:text-[#F87171]">No aprobada</span>;
  return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-900 dark:bg-[#FBBF2420] dark:text-[#FBBF24]">Pendiente</span>;
}

type Props = {
  desde: string;
  hasta: string;
  tecnicoFilter: string;
};

export default function CoordinadorForaneosPanel({ desde, hasta, tecnicoFilter }: Props) {
  const { profile } = useAuth();
  const toast = useToast();
  const [foraneos, setForaneos] = useState<ForaneoRow[]>([]);
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("PENDIENTE");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingForaneo, setEditingForaneo] = useState<ForaneoRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; fullName: string } | null>(null);
  const [rejectModal, setRejectModal] = useState<{ ids: string[] } | null>(null);
  const [rejectNota, setRejectNota] = useState("");
  const [editForm, setEditForm] = useState({ startKm: "", endKm: "", notes: "" });
  const headerCbRef = useRef<HTMLInputElement>(null);

  const canApprove =
    profile?.role === "COORDINADOR" ||
    profile?.role === "MANAGER" ||
    profile?.role === "ADMIN";

  const loadForaneos = useCallback(async () => {
    if (!profile) return;
    if (profile.role === "COORDINADOR" && !profile.zone) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ desde, hasta });
      if (tecnicoFilter !== "ALL") params.set("userId", tecnicoFilter);
      if (estadoFiltro !== "ALL") params.set("estado", estadoFiltro);
      const res = await fetch(`/api/foraneos?${params}`);
      const raw = await parseResponseJson<ForaneoRow[]>(res);
      const list: ForaneoRow[] = Array.isArray(raw) ? raw : [];
      setForaneos(res.ok ? list : []);
      setSelected(new Set());
    } catch {
      setForaneos([]);
    } finally {
      setLoading(false);
    }
  }, [profile, desde, hasta, tecnicoFilter, estadoFiltro]);

  useEffect(() => {
    loadForaneos();
  }, [loadForaneos]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return foraneos;
    const t = search.toLowerCase();
    return foraneos.filter(
      (f) =>
        f.fullName.toLowerCase().includes(t) ||
        f.documentNumber.toLowerCase().includes(t) ||
        (f.notes ?? "").toLowerCase().includes(t)
    );
  }, [foraneos, search]);

  const visibleIds = useMemo(() => filteredRows.map((f) => f.id), [filteredRows]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected = visibleIds.some((id) => selected.has(id));

  useEffect(() => {
    if (headerCbRef.current) {
      headerCbRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
    }
  }, [someVisibleSelected, allVisibleSelected]);

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    if (allVisibleSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  async function batchAprobar() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/foraneos/batch-aprobar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, approvalStatus: "APROBADA" }),
      });
      const data = await parseResponseJson<{ ok?: boolean; error?: string; actualizados?: number }>(res);
      if (res.ok && data?.ok) {
        toast.success("Aprobados", `${data.actualizados ?? ids.length} registro(s) aprobados.`);
        loadForaneos();
      } else {
        toast.error("Error", data?.error || "No se pudo aprobar");
      }
    } catch (e: unknown) {
      toast.error("Error", e instanceof Error ? e.message : "No se pudo aprobar");
    }
    setSaving(false);
  }

  async function enviarRechazo() {
    if (!rejectModal) return;
    const ids = rejectModal.ids;
    if (ids.length === 0) return;
    setSaving(true);
    try {
      if (ids.length === 1) {
        const res = await fetch(`/api/foraneos/${ids[0]}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approvalStatus: "NO_APROBADA",
            approvalNote: rejectNota.trim() || undefined,
          }),
        });
        const data = await parseResponseJson<{ ok?: boolean; error?: string }>(res);
        if (res.ok && data?.ok) {
          toast.success("Actualizado", "Registro marcado como no aprobado.");
          setRejectModal(null);
          setRejectNota("");
          loadForaneos();
        } else {
          toast.error("Error", data?.error || "No se pudo actualizar");
        }
      } else {
        const res = await fetch("/api/foraneos/batch-aprobar", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids,
            approvalStatus: "NO_APROBADA",
            approvalNote: rejectNota.trim() || undefined,
          }),
        });
        const data = await parseResponseJson<{ ok?: boolean; error?: string; actualizados?: number }>(res);
        if (res.ok && data?.ok) {
          toast.success("Actualizado", `${data.actualizados ?? ids.length} registro(s) actualizados.`);
          setRejectModal(null);
          setRejectNota("");
          loadForaneos();
        } else {
          toast.error("Error", data?.error || "No se pudo actualizar");
        }
      }
    } catch (e: unknown) {
      toast.error("Error", e instanceof Error ? e.message : "No se pudo actualizar");
    }
    setSaving(false);
  }

  async function aprobarUno(id: string) {
    try {
      const res = await fetch(`/api/foraneos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalStatus: "APROBADA" }),
      });
      const data = await parseResponseJson<{ ok?: boolean; error?: string }>(res);
      if (res.ok && data?.ok) {
        toast.success("Aprobado", "Registro foráneo aprobado.");
        loadForaneos();
      } else {
        toast.error("Error", data?.error || "No se pudo aprobar");
      }
    } catch (e: unknown) {
      toast.error("Error", e instanceof Error ? e.message : "No se pudo aprobar");
    }
  }

  function openEditModal(f: ForaneoRow) {
    setEditingForaneo(f);
    setEditForm({
      startKm: f.startKm != null ? String(f.startKm) : "",
      endKm: f.endKm != null ? String(f.endKm) : "",
      notes: f.notes ?? "",
    });
  }

  async function handleEdit() {
    if (!editingForaneo) return;
    setSaving(true);
    try {
      const body: { startKm?: number; endKm?: number; notes?: string } = {};
      if (editForm.startKm.trim() !== "") {
        const v = parseFloat(editForm.startKm.replace(",", "."));
        if (!Number.isNaN(v)) body.startKm = v;
      }
      if (editForm.endKm.trim() !== "") {
        const v = parseFloat(editForm.endKm.replace(",", "."));
        if (!Number.isNaN(v)) body.endKm = v;
      }
      body.notes = editForm.notes;

      const res = await fetch(`/api/foraneos/${editingForaneo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await parseResponseJson<{ ok?: boolean; error?: string }>(res);
      if (res.ok && data?.ok) {
        toast.success("Foráneo actualizado", "Los cambios se guardaron correctamente.");
        setEditingForaneo(null);
        loadForaneos();
      } else {
        toast.error("Error al guardar", data?.error || "No se pudo guardar");
      }
    } catch (e: unknown) {
      toast.error("Error", e instanceof Error ? e.message : "No se pudo guardar");
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/foraneos/${id}`, { method: "DELETE" });
      const data = await parseResponseJson<{ success?: boolean; error?: string; message?: string }>(res);
      if (res.ok && data?.success) {
        toast.success("Eliminado", data.message || "Foráneo eliminado");
        loadForaneos();
      } else {
        toast.error("Error", data?.error || "No se pudo eliminar");
      }
    } catch (e: unknown) {
      toast.error("Error", e instanceof Error ? e.message : "No se pudo eliminar");
    }
    setConfirmDelete(null);
  }

  const mapLink = (lat: number | null, lng: number | null) =>
    lat != null && lng != null ? (
      <a
        href={`https://www.google.com/maps?q=${lat},${lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 dark:text-bia-teal-light underline text-xs"
      >
        📍 Mapa
      </a>
    ) : (
      "—"
    );

  const driveLink = (url: string | null) =>
    url ? (
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline text-xs">
        Ver
      </a>
    ) : (
      "—"
    );

  if (!profile) return null;
  if (profile.role === "COORDINADOR" && !profile.zone) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 items-stretch sm:items-end">
        <div className="min-w-[160px]">
          <label className="block text-sm font-medium text-gray-700 dark:text-[#CBD5E1] mb-1">Estado aprobación</label>
          <select
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value as EstadoFiltro)}
            className="input-field w-full"
          >
            <option value="PENDIENTE">Pendientes</option>
            <option value="APROBADA">Aprobados</option>
            <option value="NO_APROBADA">No aprobados</option>
            <option value="ALL">Todos</option>
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700 dark:text-[#CBD5E1] mb-1">Buscar</label>
          <div className="relative">
            <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-[#64748B]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre, cédula, observaciones..."
              className="input-field pl-10 w-full"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => loadForaneos()}
          disabled={loading}
          className="btn-primary flex items-center justify-center gap-2 px-4 py-2.5 h-[42px] self-end"
        >
          {loading ? (
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <HiSearch className="h-5 w-5" />
          )}
          Actualizar
        </button>
      </div>

      {canApprove && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-primary-50 dark:bg-primary-950/40 border border-primary-200 dark:border-primary-800 rounded-lg">
          <span className="text-sm font-medium text-primary-900 dark:text-primary-100">{selected.size} seleccionado(s)</span>
          <button
            type="button"
            disabled={saving}
            onClick={() => void batchAprobar()}
            className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            Aprobar seleccionados
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setRejectNota("");
              setRejectModal({ ids: [...selected] });
            }}
            className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            Rechazar seleccionados
          </button>
        </div>
      )}

      {loading && foraneos.length === 0 ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="card text-center py-12 text-gray-500 dark:text-[#A0AEC0]">No hay registros foráneos en el período / filtro seleccionado</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto w-full min-w-0">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#162035] border-b border-gray-200 dark:border-[#3A4565]">
                  {canApprove && (
                    <th className="px-3 py-3 w-10">
                      <input
                        ref={headerCbRef}
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                        className="rounded border-gray-300 dark:border-[#3A4565] dark:bg-bia-navy-600"
                        aria-label="Seleccionar todos los visibles"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-[#A0AEC0] uppercase">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-[#A0AEC0] uppercase">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-[#A0AEC0] uppercase">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-[#A0AEC0] uppercase">Km ini</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-[#A0AEC0] uppercase">Img ini</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-[#A0AEC0] uppercase">Mapa ini</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-[#A0AEC0] uppercase">Km fin</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-[#A0AEC0] uppercase">Img fin</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-[#A0AEC0] uppercase">Mapa fin</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-[#A0AEC0] uppercase">Km rec.</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-[#A0AEC0] uppercase">Nota coord.</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-[#A0AEC0] uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-[#1E2A45] bg-white dark:bg-[#1A2340]">
                {filteredRows.map((f) => (
                  <tr key={f.id} className="hover:bg-gray-50 dark:hover:bg-[#243052]">
                    {canApprove && (
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(f.id)}
                          onChange={() => toggleRow(f.id)}
                          className="rounded border-gray-300 dark:border-[#3A4565] dark:bg-bia-navy-600"
                          aria-label={`Seleccionar ${f.fullName}`}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm text-gray-800 dark:text-white whitespace-nowrap">{f.fullName}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-white whitespace-nowrap">
                      {formatFechaTurnoDdMmmYyyy(f.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">{badgeEstado(f.approvalStatus)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-white whitespace-nowrap">
                      {f.startKm != null ? f.startKm : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">{driveLink(f.driveUrl)}</td>
                    <td className="px-4 py-3 text-sm">{mapLink(f.startLat, f.startLng)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-white whitespace-nowrap">
                      {f.endKm != null ? f.endKm : "Pendiente"}
                    </td>
                    <td className="px-4 py-3 text-sm">{driveLink(f.driveUrlFinal)}</td>
                    <td className="px-4 py-3 text-sm">{mapLink(f.endLat, f.endLng)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-white whitespace-nowrap">
                      {f.kmRecorridos != null ? `${Number(f.kmRecorridos).toFixed(1)} km` : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[140px] truncate" title={f.approvalNote ?? ""}>
                      {f.approvalNote ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <div className="flex flex-wrap gap-1 items-center">
                        {canApprove && (
                          <>
                            <button
                              type="button"
                              title="Aprobar"
                              onClick={() => void aprobarUno(f.id)}
                              className="p-1.5 rounded-lg text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40"
                            >
                              <HiCheck className="h-5 w-5" />
                            </button>
                            <button
                              type="button"
                              title="Rechazar"
                              onClick={() => {
                                setRejectNota("");
                                setRejectModal({ ids: [f.id] });
                              }}
                              className="p-1.5 rounded-lg text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40"
                            >
                              <HiBan className="h-5 w-5" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          title="Editar"
                          onClick={() => openEditModal(f)}
                          className="p-1.5 rounded-lg text-blue-600 dark:text-bia-teal-light hover:bg-blue-50 dark:hover:bg-blue-900/40"
                        >
                          <HiPencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Eliminar"
                          onClick={() => setConfirmDelete({ id: f.id, fullName: f.fullName })}
                          className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/40"
                        >
                          <HiTrash className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1A2340] rounded-2xl shadow-2xl dark:shadow-black/40 w-full max-w-md p-6 border border-transparent dark:border-[#3A4565]">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Rechazar foráneo(s)</h3>
            <p className="text-sm text-gray-500 dark:text-[#A0AEC0] mb-3">Opcional: nota para el operador ({rejectModal.ids.length} registro(s)).</p>
            <textarea
              value={rejectNota}
              onChange={(e) => setRejectNota(e.target.value)}
              rows={3}
              className="input-field w-full resize-none mb-4"
              placeholder="Motivo del rechazo..."
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setRejectModal(null);
                  setRejectNota("");
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-white bg-gray-100 dark:bg-bia-navy-600 rounded-lg hover:bg-gray-200 dark:hover:bg-[#243052]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void enviarRechazo()}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Confirmar rechazo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingForaneo && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1A2340] rounded-2xl shadow-2xl dark:shadow-black/40 w-full max-w-lg max-h-[90vh] overflow-y-auto border border-transparent dark:border-[#3A4565]">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-[#3A4565]">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Editar foráneo</h3>
                <p className="text-sm text-gray-500 dark:text-[#A0AEC0]">
                  {editingForaneo.fullName} — {formatFechaTurnoDdMmmYyyy(editingForaneo.createdAt)}
                </p>
              </div>
              <button type="button" onClick={() => setEditingForaneo(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-[#243052] rounded-lg text-gray-600 dark:text-[#CBD5E1]">
                <HiX className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-[#CBD5E1] mb-1">Km inicial</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editForm.startKm}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, startKm: e.target.value }))}
                  className="input-field w-full"
                  placeholder="Ej: 12050.5"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-[#CBD5E1] mb-1">Km final</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editForm.endKm}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, endKm: e.target.value }))}
                  className="input-field w-full"
                  placeholder="Ej: 12100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-[#CBD5E1] mb-1">Observaciones</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  className="input-field w-full resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-[#3A4565]">
              <button
                type="button"
                onClick={() => setEditingForaneo(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-white bg-gray-100 dark:bg-bia-navy-600 rounded-lg hover:bg-gray-200 dark:hover:bg-[#243052]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleEdit()}
                disabled={saving}
                className="px-6 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <HiSave className="w-4 h-4" />
                )}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1A2340] rounded-2xl shadow-2xl dark:shadow-black/40 w-full max-w-sm p-6 border border-transparent dark:border-[#3A4565]">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
                <HiTrash className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">¿Eliminar foráneo?</h3>
              <p className="text-gray-500 dark:text-[#A0AEC0] text-sm mb-6">
                Vas a eliminar el registro de <strong>{confirmDelete.fullName}</strong>. Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-white bg-gray-100 dark:bg-bia-navy-600 rounded-lg hover:bg-gray-200 dark:hover:bg-[#243052]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(confirmDelete.id)}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
