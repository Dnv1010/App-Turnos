"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { formatFechaTurnoDdMmmYyyy } from "@/lib/formatFechaTurno";
import DataTable from "@/components/ui/DataTable";
import { HiSearch, HiPencil, HiTrash, HiEye, HiLocationMarker, HiPhotograph, HiX, HiSave } from "react-icons/hi";

interface TurnoRow {
  id: string;
  userId: string;
  fecha: string;
  horaEntrada: string;
  horaSalida: string | null;
  horasOrdinarias: number;
  heDiurna: number;
  heNocturna: number;
  heDominical: number;
  heNoctDominical: number;
  recNocturno: number;
  recDominical: number;
  recNoctDominical: number;
  latEntrada: number | null;
  lngEntrada: number | null;
  latSalida: number | null;
  lngSalida: number | null;
  startPhotoUrl: string | null;
  endPhotoUrl: string | null;
  observaciones: string | null;
  user: { nombre: string; zona: string };
}

interface TecnicoOption {
  id: string;
  nombre: string;
}

function calcPreviewHours(startDate: string, startTime: string, endDate: string, endTime: string): string {
  if (!startTime || !endTime) return "—";
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const startMin = new Date(`${startDate}T${startTime}:00`).getTime();
  const endMin = new Date(`${endDate}T${endTime}:00`).getTime();
  let diff = (endMin - startMin) / (1000 * 60 * 60);
  if (diff < 0) diff += 24;
  return diff.toFixed(2);
}

export default function CoordinadorTurnosPage() {
  const { data: session } = useSession();
  const [turnos, setTurnos] = useState<TurnoRow[]>([]);
  const [tecnicos, setTecnicos] = useState<TecnicoOption[]>([]);
  const [inicio, setInicio] = useState(format(new Date(), "yyyy-MM-01"));
  const [fin, setFin] = useState(format(new Date(), "yyyy-MM-dd"));
  const [tecnicoFilter, setTecnicoFilter] = useState("ALL");
  const [estadoFilter, setEstadoFilter] = useState<"ALL" | "ACTIVO" | "FINALIZADO">("FINALIZADO");
  const [loading, setLoading] = useState(true);
  const [editingTurno, setEditingTurno] = useState<TurnoRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    notes: "",
  });

  const loadTurnos = useCallback(async () => {
    if (!session?.user?.zona) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ inicio, fin, zona: session.user.zona });
      if (tecnicoFilter !== "ALL") params.set("userId", tecnicoFilter);
      const res = await fetch(`/api/turnos?${params}`);
      let list: TurnoRow[] = await res.json();
      if (estadoFilter === "ACTIVO") list = list.filter((t) => !t.horaSalida);
      if (estadoFilter === "FINALIZADO") list = list.filter((t) => t.horaSalida);
      list = list.filter((t) => !t.observaciones?.startsWith("Cancelado"));
      setTurnos(list);
    } catch { setTurnos([]); }
    finally { setLoading(false); }
  }, [session?.user?.zona, inicio, fin, tecnicoFilter, estadoFilter]);

  useEffect(() => {
    loadTurnos();
  }, [loadTurnos]);

  useEffect(() => {
    if (!session?.user?.zona) return;
    fetch(`/api/usuarios?zona=${session.user.zona}&role=TECNICO`)
      .then((r) => r.json())
      .then((d) => { if (d.tecnicos) setTecnicos(d.tecnicos); })
      .catch(() => {});
  }, [session?.user?.zona]);

  function openEditModal(t: TurnoRow) {
    setEditingTurno(t);
    const start = new Date(t.horaEntrada);
    const end = t.horaSalida ? new Date(t.horaSalida) : null;
    setEditForm({
      startDate: format(start, "yyyy-MM-dd"),
      startTime: `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
      endDate: end ? format(end, "yyyy-MM-dd") : format(start, "yyyy-MM-dd"),
      endTime: end ? `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}` : "",
      notes: t.observaciones?.replace(/\s*\[Editado.*\]$/, "") || "",
    });
  }

  async function saveTurnoEdit() {
    if (!editingTurno) return;
    setSaving(true);
    try {
      const startISO = `${editForm.startDate}T${editForm.startTime}:00`;
      const endISO = editForm.endTime ? `${editForm.endDate}T${editForm.endTime}:00` : null;
      const res = await fetch(`/api/turnos/${editingTurno.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          horaEntrada: startISO,
          horaSalida: endISO,
          observaciones: editForm.notes || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        alert(data.msg);
        setEditingTurno(null);
        loadTurnos();
      } else {
        alert("Error: " + (data.error || "No se pudo guardar"));
      }
    } catch (e: unknown) {
      alert("Error: " + (e instanceof Error ? e.message : "No se pudo guardar"));
    }
    setSaving(false);
  }

  async function deleteTurno(turnoId: string, nombre: string) {
    if (!confirm(`¿Cancelar el turno de ${nombre}? Esta acción se puede registrar.`)) return;
    try {
      const res = await fetch(`/api/turnos/${turnoId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        alert("Turno cancelado");
        loadTurnos();
      } else {
        alert("Error: " + (data.error || "No se pudo cancelar"));
      }
    } catch (e: unknown) {
      alert("Error: " + (e instanceof Error ? e.message : "No se pudo cancelar"));
    }
  }

  const totalHoras = (t: TurnoRow) => {
    if (!t.horaSalida) return null;
    const h = (new Date(t.horaSalida).getTime() - new Date(t.horaEntrada).getTime()) / (1000 * 60 * 60);
    return h.toFixed(2);
  };
  const totalHE = (t: TurnoRow) => (t.heDiurna + t.heNocturna + t.heDominical + t.heNoctDominical).toFixed(2);
  const totalRec = (t: TurnoRow) => (t.recNocturno + t.recDominical + t.recNoctDominical).toFixed(2);

  const columns = [
    { key: "user", label: "Técnico", render: (t: TurnoRow) => t.user?.nombre ?? "—" },
    { key: "fecha", label: "Fecha", render: (t: TurnoRow) => formatFechaTurnoDdMmmYyyy(t.fecha) },
    { key: "horaEntrada", label: "Entrada", render: (t: TurnoRow) => new Date(t.horaEntrada).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }) },
    { key: "horaSalida", label: "Salida", render: (t: TurnoRow) => t.horaSalida ? new Date(t.horaSalida).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }) : "—" },
    { key: "totalHoras", label: "Total h", render: (t: TurnoRow) => totalHoras(t) ?? "—" },
    { key: "horasOrdinarias", label: "Ord.", render: (t: TurnoRow) => Math.max(0, t.horasOrdinarias ?? 0) },
    { key: "heDiurna", label: "HE Día", render: (t: TurnoRow) => (t.heDiurna ?? 0) > 0 ? (t.heDiurna ?? 0) : "—" },
    { key: "heNocturna", label: "HE Noc", render: (t: TurnoRow) => (t.heNocturna ?? 0) > 0 ? (t.heNocturna ?? 0) : "—" },
    { key: "heDominical", label: "HE Dom/Fest Día", render: (t: TurnoRow) => (t.heDominical ?? 0) > 0 ? (t.heDominical ?? 0) : "—" },
    { key: "heNoctDominical", label: "HE Dom/Fest Noc", render: (t: TurnoRow) => (t.heNoctDominical ?? 0) > 0 ? (t.heNoctDominical ?? 0) : "—" },
    { key: "recNocturno", label: "Rec. Noc", render: (t: TurnoRow) => (t.recNocturno ?? 0) > 0 ? (t.recNocturno ?? 0) : "—" },
    { key: "recDominical", label: "Rec Dom/Fest Día", render: (t: TurnoRow) => (t.recDominical ?? 0) > 0 ? (t.recDominical ?? 0) : "—" },
    { key: "recNoctDominical", label: "Rec Dom/Fest Noc", render: (t: TurnoRow) => (t.recNoctDominical ?? 0) > 0 ? (t.recNoctDominical ?? 0) : "—" },
    { key: "he", label: "HE", render: (t: TurnoRow) => totalHE(t) },
    { key: "rec", label: "Rec.", render: (t: TurnoRow) => totalRec(t) },
    { key: "latEntrada", label: "Ubicación inicio", render: (t: TurnoRow) => t.latEntrada != null && t.lngEntrada != null ? <a href={`https://www.google.com/maps?q=${t.latEntrada},${t.lngEntrada}`} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline text-xs flex items-center gap-1"><HiLocationMarker className="h-3.5 w-3.5" />Mapa</a> : "—" },
    { key: "latSalida", label: "Ubicación fin", render: (t: TurnoRow) => t.latSalida != null && t.lngSalida != null ? <a href={`https://www.google.com/maps?q=${t.latSalida},${t.lngSalida}`} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline text-xs flex items-center gap-1"><HiLocationMarker className="h-3.5 w-3.5" />Mapa</a> : "—" },
    { key: "startPhotoUrl", label: "Foto inicio", render: (t: TurnoRow) => t.startPhotoUrl ? <a href={t.startPhotoUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline text-xs flex items-center gap-1"><HiPhotograph className="h-3.5 w-3.5" />Ver</a> : "—" },
    { key: "endPhotoUrl", label: "Foto fin", render: (t: TurnoRow) => t.endPhotoUrl ? <a href={t.endPhotoUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline text-xs flex items-center gap-1"><HiPhotograph className="h-3.5 w-3.5" />Ver</a> : "—" },
    {
      key: "acciones",
      label: "Acciones",
      render: (t: TurnoRow) => (
        <div className="flex gap-2">
          <button type="button" onClick={() => openEditModal(t)} className="text-blue-600 hover:text-blue-800 p-1" title="Editar"><HiPencil className="h-4 w-4" /></button>
          <button type="button" onClick={() => deleteTurno(t.id, t.user?.nombre ?? "")} className="text-red-600 hover:text-red-800 p-1" title="Cancelar turno"><HiTrash className="h-4 w-4" /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Turnos Equipo</h2>
      <p className="text-gray-500">Zona {session?.user?.zona} — Editar o cancelar turnos de técnicos de tu zona.</p>

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
              {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
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
            <button onClick={loadTurnos} disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
              {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><HiSearch className="h-5 w-5" />Filtrar</>}
            </button>
          </div>
        </div>
      </div>

      {loading && turnos.length === 0 ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>
      ) : turnos.length === 0 ? (
        <div className="card text-center py-12 text-gray-500">No hay turnos en el período seleccionado</div>
      ) : (
        <DataTable columns={columns as never} data={turnos as never} searchable searchPlaceholder="Buscar técnico..." />
      )}

      {editingTurno && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Editar turno</h3>
                <p className="text-sm text-gray-500">{editingTurno.user?.nombre} — {formatFechaTurnoDdMmmYyyy(editingTurno.fecha)}</p>
              </div>
              <button type="button" onClick={() => setEditingTurno(null)} className="p-2 hover:bg-gray-100 rounded-lg"><HiX className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p className="text-gray-500">Turno actual:</p>
                <p className="font-medium">{new Date(editingTurno.horaEntrada).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })} → {editingTurno.horaSalida ? new Date(editingTurno.horaSalida).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }) : "En curso"}</p>
                <p className="text-gray-500 mt-1">Total: {totalHoras(editingTurno)}h | HE: {totalHE(editingTurno)}h</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fecha inicio</label>
                  <input type="date" value={editForm.startDate} onChange={(e) => setEditForm((f) => ({ ...f, startDate: e.target.value }))} className="input-field w-full" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Hora inicio</label>
                  <input type="time" step="60" value={editForm.startTime} onChange={(e) => setEditForm((f) => ({ ...f, startTime: e.target.value }))} className="input-field w-full" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fecha fin</label>
                  <input type="date" value={editForm.endDate} onChange={(e) => setEditForm((f) => ({ ...f, endDate: e.target.value }))} className="input-field w-full" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Hora fin</label>
                  <input type="time" step="60" value={editForm.endTime} onChange={(e) => setEditForm((f) => ({ ...f, endTime: e.target.value }))} className="input-field w-full" />
                </div>
              </div>
              {editForm.startTime && editForm.endTime && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                  <p className="text-blue-700 font-medium">Nuevo total: {calcPreviewHours(editForm.startDate, editForm.startTime, editForm.endDate, editForm.endTime)}h</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas / Motivo del ajuste</label>
                <textarea value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Ej: Corregido hora de salida por olvido de fichaje" rows={2} className="input-field w-full resize-none" />
              </div>
              <div className="flex gap-3 flex-wrap">
                {editingTurno.latEntrada != null && (
                  <a href={`https://www.google.com/maps?q=${editingTurno.latEntrada},${editingTurno.lngEntrada}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-blue-600 hover:underline"><HiLocationMarker className="w-3 h-3" /> Ubicación inicio</a>
                )}
                {editingTurno.latSalida != null && (
                  <a href={`https://www.google.com/maps?q=${editingTurno.latSalida},${editingTurno.lngSalida}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-blue-600 hover:underline"><HiLocationMarker className="w-3 h-3" /> Ubicación fin</a>
                )}
                {editingTurno.startPhotoUrl && <a href={editingTurno.startPhotoUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-blue-600 hover:underline"><HiPhotograph className="w-3 h-3" /> Foto inicio</a>}
                {editingTurno.endPhotoUrl && <a href={editingTurno.endPhotoUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-blue-600 hover:underline"><HiPhotograph className="w-3 h-3" /> Foto fin</a>}
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-200">
              <button type="button" onClick={() => setEditingTurno(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancelar</button>
              <button type="button" onClick={saveTurnoEdit} disabled={saving} className="px-6 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <HiSave className="w-4 h-4" />}
                Guardar y recalcular
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
