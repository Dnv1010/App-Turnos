"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay } from "date-fns";
import { HiChevronDown } from "react-icons/hi";

const OPCIONES_TURNO = ["8-17", "6-14", "14-22", "22-6", "8-14"];
const OPCIONES_NOVEDAD = ["Disponible", "Descanso", "Vacaciones", "Día de la familia", "Semana Santa", "Medio día cumpleaños", "Keynote"];

type TipoDia = "TRABAJO" | "DESCANSO" | "DISPONIBLE";

interface MallaItem {
  userId: string;
  fecha: string;
  valor: string;
  tipo?: TipoDia;
  horaInicio?: string;
  horaFin?: string;
}

interface Tecnico {
  id: string;
  nombre: string;
  email?: string;
}

export default function CoordinadorMallaPage() {
  const { data: session } = useSession();
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [mes, setMes] = useState(format(new Date(), "yyyy-MM"));
  const [malla, setMalla] = useState<MallaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDay, setEditDay] = useState<Date | null>(null);
  const [valorLibre, setValorLibre] = useState("");
  const [editTipo, setEditTipo] = useState<TipoDia>("TRABAJO");
  const [editHoraInicio, setEditHoraInicio] = useState("08:00");
  const [editHoraFin, setEditHoraFin] = useState("17:00");
  const [saving, setSaving] = useState(false);
  const [precargando, setPrecargando] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [lastClicked, setLastClicked] = useState<string | null>(null);
  const [mallaModalOpen, setMallaModalOpen] = useState(false);
  const [selectedTecnicos, setSelectedTecnicos] = useState<Set<string>>(new Set());
  const [showTecnicoDropdown, setShowTecnicoDropdown] = useState(false);
  const [festivosSet, setFestivosSet] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);

  const primaryTecnico = selectedTecnicos.size > 0 ? Array.from(selectedTecnicos)[0] : null;

  const cargarTecnicos = useCallback(async () => {
    if (!session?.user?.zona) return;
    const res = await fetch(`/api/usuarios?zona=${session.user.zona}&role=TECNICO`);
    const data = await res.json();
    setTecnicos(data.tecnicos || []);
  }, [session?.user?.zona]);

  const cargarMalla = useCallback(async (userId: string, autoPrecarga = true) => {
    if (!userId || !mes) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/malla?userId=${userId}&mes=${mes}`);
      let data: unknown = [];
      try {
        const text = await res.text();
        data = text ? JSON.parse(text) : [];
      } catch {
        data = [];
      }
      const list = Array.isArray(data) ? data : [];
      setMalla(list);
      if (list.length === 0 && autoPrecarga) {
        const precargaRes = await fetch("/api/malla/precarga", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, mes }),
        });
        const precargaData = precargaRes.ok ? await precargaRes.json().catch(() => ({})) : null;
        if (precargaData?.ok) {
          const res2 = await fetch(`/api/malla?userId=${userId}&mes=${mes}`);
          const data2 = await res2.json().catch(() => []);
          setMalla(Array.isArray(data2) ? data2 : []);
        }
      }
    } catch { setMalla([]); }
    finally { setLoading(false); }
  }, [mes]);

  useEffect(() => { cargarTecnicos(); }, [cargarTecnicos]);
  useEffect(() => { if (primaryTecnico) cargarMalla(primaryTecnico); }, [primaryTecnico, cargarMalla]);

  useEffect(() => {
    const [y, m] = mes.split("-").map(Number);
    const start = startOfMonth(new Date(y, m - 1));
    const end = endOfMonth(new Date(y, m - 1));
    const inicioStr = format(start, "yyyy-MM-dd");
    const finStr = format(end, "yyyy-MM-dd");
    fetch(`/api/festivos?inicio=${inicioStr}&fin=${finStr}`)
      .then((r) => r.json())
      .then((data: { festivos?: string[] }) => setFestivosSet(new Set(data.festivos ?? [])))
      .catch(() => setFestivosSet(new Set()));
  }, [mes]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowTecnicoDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleTecnico = (userId: string) => {
    setSelectedTecnicos((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };
  const selectAllTecnicos = () => setSelectedTecnicos(new Set(tecnicos.map((t) => t.id)));
  const deselectAllTecnicos = () => setSelectedTecnicos(new Set());

  const [year, month] = mes.split("-").map(Number);
  const start = startOfMonth(new Date(year, month - 1));
  const end = endOfMonth(new Date(year, month - 1));
  const days = eachDayOfInterval({ start, end });

  const dateKey = (d: Date) => `${format(d, "yyyy")}-${String(format(d, "M")).padStart(2, "0")}-${String(format(d, "d")).padStart(2, "0")}`;

  const getItem = (fecha: Date) => {
    const key = dateKey(fecha);
    return malla.find((m) => (typeof m.fecha === "string" ? m.fecha : format(new Date(m.fecha), "yyyy-MM-dd")) === key);
  };
  const getValor = (fecha: Date) => getItem(fecha)?.valor ?? "";

  const getMallaStyle = (valor: string, item?: MallaItem | null): CSSProperties => {
    const tipo = item?.tipo;
    const v = (valor || "").toLowerCase();
    if (!valor) return { backgroundColor: "#f9fafb", color: "#6b7280" };
    if (tipo === "DESCANSO" || v.includes("descanso") || v.includes("vacacion")) return { backgroundColor: "#f3f4f6", color: "#6b7280" };
    if (tipo === "DISPONIBLE" || v === "disponible") return { backgroundColor: "#dcfce7", color: "#15803d" };
    if (v.includes("festivo") || v.includes("semana santa")) return { backgroundColor: "#fef9c3", color: "#854d0e" };
    if (v.includes("familia") || v.includes("día de la familia")) return { backgroundColor: "#f3e8ff", color: "#7e22ce" };
    if (tipo === "TRABAJO" || OPCIONES_TURNO.some((o) => valor.includes(o) || /^\d+-\d+$/.test(valor))) return { backgroundColor: "#dbeafe", color: "#1d4ed8" };
    return { backgroundColor: "#f3f4f6", color: "#6b7280" };
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

  const precargarMalla = async () => {
    if (!primaryTecnico) return;
    setPrecargando(true);
    try {
      const res = await fetch("/api/malla/precarga", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: primaryTecnico, mes }),
      });
      const data = await res.json();
      if (data.ok) {
        alert(`Malla precargada: ${data.registros} días (L-V 08:00-17:00, Sáb 08:00-12:00, Dom y festivos descanso)`);
        cargarMalla(primaryTecnico);
      } else alert("Error: " + (data.error || "No se pudo precargar"));
    } catch (e) { alert("Error: " + (e instanceof Error ? e.message : "No se pudo precargar")); }
    setPrecargando(false);
  };

  const guardar = async (fecha: Date, valor: string, tipo?: TipoDia, horaInicio?: string, horaFin?: string) => {
    const uid = primaryTecnico;
    if (!uid) return;
    setSaving(true);
    try {
      const fechaStr = dateKey(fecha);
      const body: Record<string, unknown> = { userId: uid, fecha: fechaStr };
      if (tipo !== undefined) body.tipo = tipo;
      if (horaInicio !== undefined) body.horaInicio = horaInicio;
      if (horaFin !== undefined) body.horaFin = horaFin;
      if (valor !== undefined) body.valor = valor;
      const res = await fetch("/api/malla", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Error al guardar");
      setEditDay(null);
      setValorLibre("");
      setEditTipo("TRABAJO");
      setEditHoraInicio("08:00");
      setEditHoraFin("17:00");
      cargarMalla(uid);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const assignMallaToSelected = async (valor: string) => {
    if (selectedTecnicos.size === 0) {
      alert("Selecciona al menos un técnico");
      return;
    }
    if (selectedDays.size === 0) {
      alert("Selecciona al menos un día");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/malla/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: Array.from(selectedTecnicos),
          fechas: Array.from(selectedDays),
          valor,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        alert(`✓ Malla "${valor}" asignada a ${selectedTecnicos.size} técnico(s) en ${selectedDays.size} día(s) = ${data.registros} registros`);
        setSelectedDays(new Set());
        setMallaModalOpen(false);
        if (primaryTecnico) cargarMalla(primaryTecnico);
      } else {
        alert("Error: " + (data.error || "No se pudo asignar"));
      }
    } catch (e: unknown) {
      alert("Error: " + (e instanceof Error ? e.message : "No se pudo asignar"));
    }
    setSaving(false);
  };

  const weekDays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const firstWeekday = getDay(start) === 0 ? 6 : getDay(start) - 1;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Malla de Turnos</h2>
      <p className="text-gray-500">Zona {session?.user?.zona}</p>

      <div className="card flex flex-wrap gap-4 items-end">
        <div className="relative min-w-[220px]" ref={dropdownRef}>
          <label className="block text-xs font-medium text-gray-600 mb-1">Técnicos</label>
          <button
            type="button"
            onClick={() => setShowTecnicoDropdown(!showTecnicoDropdown)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-left bg-white hover:border-gray-400 flex items-center justify-between"
          >
            <span>
              {selectedTecnicos.size === 0
                ? "Seleccionar técnicos..."
                : selectedTecnicos.size === tecnicos.length
                  ? "Todos los técnicos"
                  : `${selectedTecnicos.size} técnico${selectedTecnicos.size > 1 ? "s" : ""} seleccionado${selectedTecnicos.size > 1 ? "s" : ""}`
              }
            </span>
            <HiChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" />
          </button>
          {showTecnicoDropdown && (
            <div className="absolute z-20 mt-1 w-full max-w-sm bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
              <div className="sticky top-0 bg-gray-50 px-3 py-2 border-b border-gray-200 flex gap-2">
                <button type="button" onClick={selectAllTecnicos} className="text-xs text-blue-600 font-medium hover:underline">Seleccionar todos</button>
                <span className="text-gray-300">|</span>
                <button type="button" onClick={deselectAllTecnicos} className="text-xs text-gray-500 font-medium hover:underline">Ninguno</button>
              </div>
              {tecnicos.map((t) => (
                <label key={t.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={selectedTecnicos.has(t.id)} onChange={() => toggleTecnico(t.id)} className="w-4 h-4 text-blue-600 rounded border-gray-300" />
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-gray-900">{t.nombre}</span>
                    {t.email && <span className="text-xs text-gray-400 ml-2">{t.email}</span>}
                  </div>
                </label>
              ))}
            </div>
          )}
          {selectedTecnicos.size > 0 && selectedTecnicos.size <= 5 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {tecnicos.filter((t) => selectedTecnicos.has(t.id)).map((t) => (
                <span key={t.id} className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                  {t.nombre}
                  <button type="button" onClick={() => toggleTecnico(t.id)} className="hover:text-blue-900">×</button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mes</label>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="input-field" />
        </div>
        {primaryTecnico && (
          <button type="button" onClick={precargarMalla} disabled={precargando || loading} className="btn-secondary text-sm py-2">
            {precargando ? "Precargando…" : "Precargar malla (L-V 08-17, Sáb 08-12, Dom/festivos descanso)"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs mb-4">
        <span className="px-2 py-1 rounded" style={{ backgroundColor: "#dbeafe", color: "#1d4ed8" }}>TRABAJO</span>
        <span className="px-2 py-1 rounded" style={{ backgroundColor: "#f3f4f6", color: "#6b7280" }}>DESCANSO</span>
        <span className="px-2 py-1 rounded" style={{ backgroundColor: "#dcfce7", color: "#15803d" }}>DISPONIBLE</span>
        <span className="px-2 py-1 rounded" style={{ backgroundColor: "#fef9c3", color: "#854d0e" }}>FESTIVO</span>
        <span className="px-2 py-1 rounded" style={{ backgroundColor: "#f3e8ff", color: "#7e22ce" }}>DÍA FAMILIA</span>
      </div>

      {selectedTecnicos.size === 0 ? (
        <div className="card text-center py-12 text-gray-500">Selecciona uno o más técnicos para ver o asignar la malla</div>
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
              const esDomingo = day.getDay() === 0;
              const esFestivo = festivosSet.has(keyStr);
              const esRojo = esDomingo || esFestivo;
              return (
                <div key={day.toISOString()} className="min-h-[80px] border border-gray-200 rounded-lg p-2 relative">
                  <div className="text-xs mb-1">
                    <span style={{ color: esRojo ? "#ef4444" : "inherit", fontWeight: esRojo ? "bold" : "normal" }}>
                      {format(day, "d")}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      if (e.shiftKey) {
                        handleDayClick(day, true);
                      } else if (selectedDays.size > 0) {
                        toggleDay(keyStr);
                      } else {
                        const item = getItem(day);
                        setEditDay(day);
                        if (item?.tipo) setEditTipo(item.tipo);
                        else if (valor === "descanso") setEditTipo("DESCANSO");
                        else if (valor === "disponible") setEditTipo("DISPONIBLE");
                        else setEditTipo("TRABAJO");
                        setEditHoraInicio(item?.horaInicio || "08:00");
                        setEditHoraFin(item?.horaFin || "17:00");
                      }
                    }}
                    className={`w-full text-left text-xs rounded px-2 py-1 break-words border-2 transition-colors ${isSelected ? "border-blue-600 ring-2 ring-blue-400" : "border-transparent"}`}
                    style={getMallaStyle(valor, getItem(day))}
                  >
                    {valor || "—"}
                  </button>
                  {isEdit && (
                    <div className="absolute top-full left-0 mt-1 z-10 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-72">
                      <p className="text-xs font-medium text-gray-700 mb-2">Tipo:</p>
                      <select value={editTipo} onChange={(e) => setEditTipo(e.target.value as TipoDia)} className="input-field w-full text-xs py-1.5 mb-2">
                        <option value="TRABAJO">Trabajo</option>
                        <option value="DESCANSO">Descanso</option>
                        <option value="DISPONIBLE">Disponible</option>
                      </select>
                      {editTipo === "TRABAJO" && (
                        <div className="flex gap-2 mb-2">
                          <div>
                            <label className="text-xs text-gray-500">Inicio</label>
                            <input type="time" value={editHoraInicio} onChange={(e) => setEditHoraInicio(e.target.value)} className="input-field w-full text-xs py-1" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">Fin</label>
                            <input type="time" value={editHoraFin} onChange={(e) => setEditHoraFin(e.target.value)} className="input-field w-full text-xs py-1" />
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2 flex-wrap">
                        <button type="button" onClick={() => guardar(day, editTipo === "DESCANSO" ? "descanso" : editTipo === "DISPONIBLE" ? "disponible" : `${editHoraInicio}-${editHoraFin}`, editTipo, editTipo === "TRABAJO" ? editHoraInicio : undefined, editTipo === "TRABAJO" ? editHoraFin : undefined)} disabled={saving} className="btn-primary text-xs py-1">Guardar</button>
                        <button type="button" onClick={() => setEditDay(null)} className="text-gray-500 text-xs py-1">Cerrar</button>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">Rápido:</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {OPCIONES_TURNO.map((o) => {
                          const [h1, h2] = o.split("-").map((x) => x.length <= 2 ? `${x.padStart(2, "0")}:00` : `${x.slice(0, 2).padStart(2, "0")}:${x.slice(2)}`);
                          return <button key={o} type="button" onClick={() => guardar(day, o, "TRABAJO", h1, h2)} className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded hover:bg-blue-200">{o}</button>;
                        })}
                        <button type="button" onClick={() => guardar(day, "descanso", "DESCANSO")} className="px-2 py-0.5 bg-cyan-100 text-cyan-800 text-xs rounded hover:bg-cyan-200">Descanso</button>
                        <button type="button" onClick={() => guardar(day, "disponible", "DISPONIBLE")} className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded hover:bg-green-200">Disponible</button>
                      </div>
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
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Asignar valor a {selectedTecnicos.size > 0 ? `${selectedTecnicos.size} técnico(s) × ` : ""}{selectedDays.size} día(s)</h3>
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
