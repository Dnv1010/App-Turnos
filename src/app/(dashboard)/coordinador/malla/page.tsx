"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import { format, startOfMonth, endOfMonth, addDays, eachDayOfInterval, getDay, isSameDay } from "date-fns";
import { es } from "date-fns/locale";

const OPCIONES_TURNO = ["8-17", "6-14", "14-22", "22-6", "8-14"];
const OPCIONES_NOVEDAD = ["Disponible", "Descanso", "Vacaciones", "Día de la familia", "Semana Santa", "Medio día cumpleaños", "Keynote"];

interface MallaItem {
  userId: string;
  fecha: string;
  valor: string;
}

interface Tecnico {
  id: string;
  nombre: string;
}

export default function CoordinadorMallaPage() {
  const { data: session } = useSession();
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [tecnicoId, setTecnicoId] = useState("");
  const [mes, setMes] = useState(format(new Date(), "yyyy-MM"));
  const [malla, setMalla] = useState<MallaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDay, setEditDay] = useState<Date | null>(null);
  const [valorLibre, setValorLibre] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [lastClicked, setLastClicked] = useState<string | null>(null);
  const [mallaModalOpen, setMallaModalOpen] = useState(false);

  const cargarTecnicos = useCallback(async () => {
    if (!session?.user?.zona) return;
    const res = await fetch(`/api/usuarios?zona=${session.user.zona}&role=TECNICO`);
    const data = await res.json();
    setTecnicos(data.tecnicos || []);
    if (data.tecnicos?.length && !tecnicoId) setTecnicoId(data.tecnicos[0].id);
  }, [session?.user?.zona]);

  const cargarMalla = useCallback(async () => {
    if (!tecnicoId || !mes) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/malla?userId=${tecnicoId}&mes=${mes}`);
      const data = await res.json();
      setMalla(Array.isArray(data) ? data : []);
    } catch { setMalla([]); }
    finally { setLoading(false); }
  }, [tecnicoId, mes]);

  useEffect(() => { cargarTecnicos(); }, [cargarTecnicos]);
  useEffect(() => { if (tecnicoId) cargarMalla(); }, [tecnicoId, cargarMalla]);

  const [year, month] = mes.split("-").map(Number);
  const start = startOfMonth(new Date(year, month - 1));
  const end = endOfMonth(new Date(year, month - 1));
  const days = eachDayOfInterval({ start, end });

  const dateKey = (d: Date) => `${format(d, "yyyy")}-${String(format(d, "M")).padStart(2, "0")}-${String(format(d, "d")).padStart(2, "0")}`;

  const getValor = (fecha: Date) => {
    const key = dateKey(fecha);
    return malla.find((m) => (typeof m.fecha === "string" ? m.fecha : format(new Date(m.fecha), "yyyy-MM-dd")) === key)?.valor ?? "";
  };

  const getClass = (valor: string) => {
    if (!valor) return "bg-gray-50";
    if (OPCIONES_TURNO.some((o) => valor.includes(o) || /^\d+-\d+$/.test(valor))) return "bg-blue-100 text-blue-800";
    if (valor === "Disponible") return "bg-green-100 text-green-800";
    if (["Descanso", "Vacaciones"].includes(valor)) return "bg-cyan-100 text-cyan-800";
    if (["Día de la familia", "Semana Santa"].includes(valor)) return "bg-purple-100 text-purple-800";
    if (["Medio día cumpleaños", "Keynote"].includes(valor)) return "bg-purple-50 text-purple-700";
    return "bg-gray-100 text-gray-800";
  };

  const fechaStrFromDay = (d: Date) => dateKey(d);

  const allDaysInMonth = days.map((d) => dateKey(d));

  const toggleDay = (dateKeyStr: string) => {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dateKeyStr)) next.delete(dateKeyStr);
      else next.add(dateKeyStr);
      return next;
    });
  };

  const handleDayClick = (day: Date, shiftKey: boolean) => {
    const key = dateKey(day);
    if (shiftKey && lastClicked) {
      const startIdx = allDaysInMonth.indexOf(lastClicked);
      const endIdx = allDaysInMonth.indexOf(key);
      const [from, to] = startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
      setSelectedDays((prev) => {
        const next = new Set(prev);
        for (let i = from; i <= to; i++) next.add(allDaysInMonth[i]);
        return next;
      });
    } else {
      toggleDay(key);
    }
    setLastClicked(key);
  };

  const guardar = async (fecha: Date, valor: string) => {
    if (!tecnicoId) return;
    setSaving(true);
    try {
      const fechaStr = dateKey(fecha);
      const res = await fetch("/api/malla", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: tecnicoId, fecha: fechaStr, valor }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      setEditDay(null);
      setValorLibre("");
      cargarMalla();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const assignMallaToSelected = async (valor: string) => {
    if (!tecnicoId || selectedDays.size === 0) return;
    setSaving(true);
    try {
      await Promise.all(
        Array.from(selectedDays).map((fecha) =>
          fetch("/api/malla", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: tecnicoId, fecha, valor }),
          })
        )
      );
      setSelectedDays(new Set());
      setMallaModalOpen(false);
      cargarMalla();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const weekDays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const firstWeekday = getDay(start) === 0 ? 6 : getDay(start) - 1;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Malla de Turnos</h2>
      <p className="text-gray-500">Zona {session?.user?.zona}</p>

      <div className="card flex flex-wrap gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Técnico</label>
          <select value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)} className="input-field min-w-[200px]">
            <option value="">Seleccionar</option>
            {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mes</label>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="input-field" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs mb-4">
        <span className="px-2 py-1 rounded bg-blue-100 text-blue-800">Turno (horario)</span>
        <span className="px-2 py-1 rounded bg-green-100 text-green-800">Disponible</span>
        <span className="px-2 py-1 rounded bg-cyan-100 text-cyan-800">Descanso / Vacaciones</span>
        <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-800">Festivo</span>
        <span className="px-2 py-1 rounded bg-purple-100 text-purple-800">Día familia / Semana Santa</span>
      </div>

      {!tecnicoId ? (
        <div className="card text-center py-12 text-gray-500">Selecciona un técnico</div>
      ) : loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>
      ) : (
        <div className="card overflow-x-auto">
          <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
            {weekDays.map((d) => (
              <div key={d} className="text-center text-xs font-semibold text-gray-600 py-2">{d}</div>
            ))}
            {Array.from({ length: firstWeekday }, (_, i) => <div key={`empty-${i}`} />)}
            {days.map((day) => {
              const valor = getValor(day);
              const keyStr = dateKey(day);
              const isSelected = selectedDays.has(keyStr);
              const isEdit = editDay && isSameDay(editDay, day);
              return (
                <div key={day.toISOString()} className="min-h-[80px] border border-gray-200 rounded-lg p-2 relative">
                  <div className="text-xs text-gray-500 mb-1">{format(day, "d")}</div>
                  <button
                    type="button"
                    onClick={(e) => {
                      if (e.shiftKey) {
                        handleDayClick(day, true);
                      } else if (selectedDays.size > 0) {
                        toggleDay(keyStr);
                      } else {
                        setEditDay(day);
                      }
                    }}
                    className={`w-full text-left text-xs rounded px-2 py-1 break-words border-2 transition-colors ${isSelected ? "border-blue-600 bg-blue-100 ring-2 ring-blue-400" : "border-transparent"} ${getClass(valor)}`}
                  >
                    {valor || "—"}
                  </button>
                  {isEdit && (
                    <div className="absolute top-full left-0 mt-1 z-10 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-64">
                      <p className="text-xs font-medium text-gray-700 mb-2">Turnos:</p>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {OPCIONES_TURNO.map((o) => (
                          <button key={o} type="button" onClick={() => guardar(day, o)} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded hover:bg-blue-200">{o}</button>
                        ))}
                      </div>
                      <p className="text-xs font-medium text-gray-700 mb-2">Novedades:</p>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {OPCIONES_NOVEDAD.map((o) => (
                          <button key={o} type="button" onClick={() => guardar(day, o)} className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded hover:bg-gray-200">{o}</button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input type="text" value={valorLibre} onChange={(e) => setValorLibre(e.target.value)} placeholder="Otro valor" className="input-field flex-1 text-xs py-1" />
                        <button type="button" onClick={() => { if (valorLibre.trim()) guardar(day, valorLibre.trim()); }} disabled={saving} className="btn-primary text-xs py-1">Guardar</button>
                      </div>
                      <button type="button" onClick={() => setEditDay(null)} className="text-gray-500 text-xs mt-2">Cerrar</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedDays.size > 0 && (
        <div className="sticky bottom-4 flex flex-wrap justify-center gap-3 z-10">
          <button
            type="button"
            onClick={() => setMallaModalOpen(true)}
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl shadow-lg hover:bg-blue-700"
          >
            Asignar malla a {selectedDays.size} día{selectedDays.size > 1 ? "s" : ""}
          </button>
          <button
            type="button"
            onClick={() => setSelectedDays(new Set())}
            className="px-4 py-3 bg-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-300"
          >
            Limpiar
          </button>
        </div>
      )}

      {mallaModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-20 p-4" onClick={() => setMallaModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Asignar valor a {selectedDays.size} días</h3>
            <p className="text-xs text-gray-500 mb-3">Turnos:</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {OPCIONES_TURNO.map((o) => (
                <button key={o} type="button" onClick={() => assignMallaToSelected(o)} disabled={saving} className="px-3 py-1.5 bg-blue-100 text-blue-800 text-sm rounded-lg hover:bg-blue-200">{o}</button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mb-3">Novedades:</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {OPCIONES_NOVEDAD.map((o) => (
                <button key={o} type="button" onClick={() => assignMallaToSelected(o)} disabled={saving} className="px-3 py-1.5 bg-gray-100 text-gray-800 text-sm rounded-lg hover:bg-gray-200">{o}</button>
              ))}
            </div>
            <button type="button" onClick={() => setMallaModalOpen(false)} className="text-gray-500 text-sm">Cerrar</button>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500 mt-2">Click para seleccionar un día (o abrir opciones). Shift+Click para seleccionar rango.</p>
    </div>
  );
}
