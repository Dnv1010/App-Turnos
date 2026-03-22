"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { formatFechaTurnoDdMmmYyyy } from "@/lib/formatFechaTurno";
import { parseResponseJson } from "@/lib/parseFetchJson";
import DataTable from "@/components/ui/DataTable";
import { useToast } from "@/components/ui/Toast";
import { HiSearch, HiPencil, HiTrash, HiLocationMarker, HiX, HiSave } from "react-icons/hi";

interface ForaneoRow {
  id: string;
  nombre: string;
  cedula: string;
  zona: string;
  fecha: string;
  kmInicial: number | null;
  kmFinal: number | null;
  kmRecorridos: number | null;
  driveUrl: string | null;
  driveUrlFinal: string | null;
  latInicial: number | null;
  lngInicial: number | null;
  latFinal: number | null;
  lngFinal: number | null;
  observaciones: string | null;
}

interface TecnicoOption {
  id: string;
  nombre: string;
}

export default function CoordinadorForaneosPage() {
  const { data: session } = useSession();
  const toast = useToast();
  const [foraneos, setForaneos] = useState<ForaneoRow[]>([]);
  const [tecnicos, setTecnicos] = useState<TecnicoOption[]>([]);
  const [inicio, setInicio] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [fin, setFin] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [tecnicoFilter, setTecnicoFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [editingForaneo, setEditingForaneo] = useState<ForaneoRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; nombre: string } | null>(null);
  const [editForm, setEditForm] = useState({
    kmInicial: "",
    kmFinal: "",
    observaciones: "",
  });

  const loadForaneos = useCallback(async () => {
    if (!session?.user?.zona) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ desde: inicio, hasta: fin });
      if (tecnicoFilter !== "ALL") params.set("userId", tecnicoFilter);
      const res = await fetch(`/api/foraneos?${params}`);
      const raw = await parseResponseJson<ForaneoRow[]>(res);
      const list: ForaneoRow[] = Array.isArray(raw) ? raw : [];
      setForaneos(res.ok ? list : []);
    } catch {
      setForaneos([]);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.zona, inicio, fin, tecnicoFilter]);

  useEffect(() => {
    loadForaneos();
  }, [loadForaneos]);

  useEffect(() => {
    if (!session?.user?.zona) return;
    fetch(`/api/usuarios?zona=${session.user.zona}&role=TECNICO`)
      .then(async (r) => parseResponseJson<{ tecnicos?: TecnicoOption[] }>(r))
      .then((d) => {
        if (d?.tecnicos) setTecnicos(d.tecnicos);
      })
      .catch(() => {});
  }, [session?.user?.zona]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") loadForaneos();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [loadForaneos]);

  function openEditModal(f: ForaneoRow) {
    setEditingForaneo(f);
    setEditForm({
      kmInicial: f.kmInicial != null ? String(f.kmInicial) : "",
      kmFinal: f.kmFinal != null ? String(f.kmFinal) : "",
      observaciones: f.observaciones ?? "",
    });
  }

  async function handleEdit() {
    if (!editingForaneo) return;
    setSaving(true);
    try {
      const body: { kmInicial?: number; kmFinal?: number; observaciones?: string } = {};
      if (editForm.kmInicial.trim() !== "") {
        const v = parseFloat(editForm.kmInicial.replace(",", "."));
        if (!Number.isNaN(v)) body.kmInicial = v;
      }
      if (editForm.kmFinal.trim() !== "") {
        const v = parseFloat(editForm.kmFinal.replace(",", "."));
        if (!Number.isNaN(v)) body.kmFinal = v;
      }
      body.observaciones = editForm.observaciones;

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
        className="text-primary-600 hover:underline text-xs flex items-center gap-1"
      >
        <HiLocationMarker className="h-3.5 w-3.5" />
        Mapa
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

  const columns = [
    { key: "nombre", label: "Nombre", render: (f: ForaneoRow) => f.nombre ?? "—" },
    { key: "fecha", label: "Fecha", render: (f: ForaneoRow) => formatFechaTurnoDdMmmYyyy(f.fecha) },
    { key: "kmInicial", label: "Km Inicial", render: (f: ForaneoRow) => (f.kmInicial != null ? f.kmInicial : "—") },
    { key: "driveUrl", label: "Img Km Inicial", render: (f: ForaneoRow) => driveLink(f.driveUrl) },
    { key: "mapIni", label: "Mapa Km Inicial", render: (f: ForaneoRow) => mapLink(f.latInicial, f.lngInicial) },
    {
      key: "kmFinal",
      label: "Km Final",
      render: (f: ForaneoRow) => (f.kmFinal != null ? f.kmFinal : "Pendiente"),
    },
    { key: "driveUrlFinal", label: "Img Km Final", render: (f: ForaneoRow) => driveLink(f.driveUrlFinal) },
    { key: "mapFin", label: "Mapa Km Final", render: (f: ForaneoRow) => mapLink(f.latFinal, f.lngFinal) },
    {
      key: "kmRecorridos",
      label: "Km Recorridos",
      render: (f: ForaneoRow) =>
        f.kmRecorridos != null ? `${Number(f.kmRecorridos).toFixed(1)} km` : "—",
    },
    {
      key: "acciones",
      label: "Acciones",
      render: (f: ForaneoRow) => (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => openEditModal(f)}
            className="text-blue-600 hover:text-blue-800 p-1"
            title="Editar"
          >
            <HiPencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete({ id: f.id, nombre: f.nombre })}
            className="text-red-600 hover:text-red-800 p-1"
            title="Eliminar"
          >
            <HiTrash className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Foráneos</h2>
      <p className="text-gray-500">
        Zona {session?.user?.zona} — Registros de foráneos de los técnicos de tu zona.
      </p>

      <div className="card">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
            <input
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
            <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Técnico</label>
            <select
              value={tecnicoFilter}
              onChange={(e) => setTecnicoFilter(e.target.value)}
              className="input-field"
            >
              <option value="ALL">Todos</option>
              {tecnicos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={loadForaneos}
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <HiSearch className="h-5 w-5" />
                  Filtrar
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {loading && foraneos.length === 0 ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : foraneos.length === 0 ? (
        <div className="card text-center py-12 text-gray-500">No hay registros foráneos en el período seleccionado</div>
      ) : (
        <DataTable columns={columns as never} data={foraneos as never} searchable searchPlaceholder="Buscar..." />
      )}

      {editingForaneo && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Editar foráneo</h3>
                <p className="text-sm text-gray-500">
                  {editingForaneo.nombre} — {formatFechaTurnoDdMmmYyyy(editingForaneo.fecha)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingForaneo(null)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <HiX className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Km inicial</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editForm.kmInicial}
                  onChange={(e) => setEditForm((f) => ({ ...f, kmInicial: e.target.value }))}
                  className="input-field w-full"
                  placeholder="Ej: 12050.5"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Km final</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editForm.kmFinal}
                  onChange={(e) => setEditForm((f) => ({ ...f, kmFinal: e.target.value }))}
                  className="input-field w-full"
                  placeholder="Ej: 12100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Observaciones</label>
                <textarea
                  value={editForm.observaciones}
                  onChange={(e) => setEditForm((f) => ({ ...f, observaciones: e.target.value }))}
                  rows={3}
                  className="input-field w-full resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setEditingForaneo(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleEdit}
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <HiTrash className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">¿Eliminar foráneo?</h3>
              <p className="text-gray-500 text-sm mb-6">
                Vas a eliminar el registro de <strong>{confirmDelete.nombre}</strong>. Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(confirmDelete.id)}
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
