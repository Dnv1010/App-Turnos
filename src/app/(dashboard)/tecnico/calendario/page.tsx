"use client";

import { useAuth } from "@/lib/auth-provider";
import { useState, useEffect, useMemo } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { HiChevronLeft, HiChevronRight } from "react-icons/hi";
import { parseResponseJson } from "@/lib/parseFetchJson";

interface TurnoEntry {
  fecha: string;
  horaEntrada: string;
  horaSalida: string | null;
  horasOrdinarias: number;
}

type TipoDia =
  | "TRABAJO"
  | "DESCANSO"
  | "DISPONIBLE"
  | "DIA_FAMILIA"
  | "INCAPACITADO"
  | "VACACIONES"
  | "MEDIO_CUMPLE";

interface MallaItem {
  userId: string;
  fecha: string;
  valor: string;
  tipo?: TipoDia;
  horaInicio?: string;
  horaFin?: string;
}

type EstiloMalla = {
  classes: string;
  etiqueta: string;
  emoji: string;
};

function clasificarMalla(item: MallaItem | null): EstiloMalla | null {
  if (!item) return null;
  const tipo = item.tipo;
  const v = (item.valor ?? "").toLowerCase();

  if (tipo === "DISPONIBLE" || v === "disponible") {
    return {
      etiqueta: "Disponible",
      emoji: "🟢",
      classes: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-200 dark:border-green-700/60",
    };
  }
  if (tipo === "DESCANSO" || v.includes("descanso")) {
    return {
      etiqueta: "Descanso",
      emoji: "💤",
      classes: "bg-gray-100 text-gray-700 border-gray-300 dark:bg-[#1E2A45] dark:text-[#CBD5E1] dark:border-[#3A4565]",
    };
  }
  if (tipo === "VACACIONES" || v.includes("vacacion")) {
    return {
      etiqueta: "Vacaciones",
      emoji: "🏖️",
      classes: "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-700/60",
    };
  }
  if (tipo === "INCAPACITADO" || v.includes("incapacitad")) {
    return {
      etiqueta: "Incapacitado",
      emoji: "🩺",
      classes: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-700/60",
    };
  }
  if (tipo === "DIA_FAMILIA" || v.includes("familia")) {
    return {
      etiqueta: "Día Familia",
      emoji: "👨‍👩‍👧",
      classes: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-700/60",
    };
  }
  if (tipo === "MEDIO_CUMPLE" || (v.includes("medio") && v.includes("cumple"))) {
    return {
      etiqueta: "½ Cumpleaños",
      emoji: "🎂",
      classes: "bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-950/40 dark:text-pink-200 dark:border-pink-700/60",
    };
  }
  if (v.includes("semana santa")) {
    return {
      etiqueta: "Semana Santa",
      emoji: "✝️",
      classes: "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950/40 dark:text-yellow-200 dark:border-yellow-700/60",
    };
  }
  if (tipo === "TRABAJO" || /^\d{1,2}[:.\-]?\d{0,2}\s*[-–]\s*\d{1,2}/.test(item.valor)) {
    return {
      etiqueta: "Trabajo",
      emoji: "🔵",
      classes: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-900/40 dark:text-blue-100 dark:border-blue-700/60",
    };
  }
  return {
    etiqueta: item.valor || "—",
    emoji: "",
    classes: "bg-gray-100 text-gray-700 border-gray-300 dark:bg-[#1E2A45] dark:text-[#CBD5E1] dark:border-[#3A4565]",
  };
}

export default function CalendarioPage() {
  const { profile } = useAuth();
  const [mesActual, setMesActual] = useState(new Date());
  const [turnos, setTurnos] = useState<TurnoEntry[]>([]);
  const [malla, setMalla] = useState<MallaItem[]>([]);
  const [loading, setLoading] = useState(true);

  const mesKey = format(mesActual, "yyyy-MM");

  useEffect(() => {
    if (!profile?.id) return;
    const inicio = format(startOfMonth(mesActual), "yyyy-MM-dd");
    const fin = format(endOfMonth(mesActual), "yyyy-MM-dd");
    setLoading(true);
    Promise.all([
      fetch(`/api/turnos?userId=${profile?.id}&inicio=${inicio}&fin=${fin}`).then(async (r) => {
        const j = await parseResponseJson<TurnoEntry[]>(r);
        return Array.isArray(j) ? j : [];
      }),
      fetch(`/api/malla?userId=${profile?.id}&mes=${mesKey}`).then(async (r) => {
        if (!r.ok) return [];
        const j = await parseResponseJson<MallaItem[]>(r);
        return Array.isArray(j) ? j : [];
      }),
    ])
      .then(([turnosData, mallaData]) => {
        setTurnos(Array.isArray(turnosData) ? turnosData : []);
        setMalla(Array.isArray(mallaData) ? mallaData : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profile?.id, mesActual, mesKey]);

  const dias = eachDayOfInterval({ start: startOfMonth(mesActual), end: endOfMonth(mesActual) });
  const primerDia = getDay(startOfMonth(mesActual));
  const offsetDias = primerDia === 0 ? 6 : primerDia - 1;

  const mallaMap = useMemo(() => {
    const map = new Map<string, MallaItem>();
    malla.forEach((m) => map.set(m.fecha, m));
    return map;
  }, [malla]);

  const getTurnoDelDia = (fecha: Date) => {
    const fechaStr = format(fecha, "yyyy-MM-dd");
    return turnos.find((t) => t.fecha.startsWith(fechaStr));
  };

  const getMallaItemDelDia = (fecha: Date): MallaItem | null => {
    const key = `${format(fecha, "yyyy")}-${String(format(fecha, "M")).padStart(2, "0")}-${String(format(fecha, "d")).padStart(2, "0")}`;
    return mallaMap.get(key) ?? null;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Calendario</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setMesActual(subMonths(mesActual, 1))} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#243052] text-gray-600 dark:text-[#A0AEC0]">
            <HiChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-lg font-semibold text-gray-900 dark:text-white min-w-[180px] text-center capitalize">
            {format(mesActual, "MMMM yyyy", { locale: es })}
          </span>
          <button onClick={() => setMesActual(addMonths(mesActual, 1))} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#243052] text-gray-600 dark:text-[#A0AEC0]">
            <HiChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="card p-2 sm:p-4">
        <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-[#243052] rounded-lg overflow-hidden">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((dia) => (
            <div key={dia} className="bg-gray-50 dark:bg-[#162035] py-2 text-center text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-[#A0AEC0] uppercase">{dia}</div>
          ))}
          {Array.from({ length: offsetDias }).map((_, i) => (
            <div key={`empty-${i}`} className="bg-white dark:bg-[#1A2340] border border-gray-200 dark:border-[#3A4565] p-1 sm:p-2 min-h-[88px] sm:min-h-[110px]" />
          ))}
          {dias.map((dia) => {
            const turno = getTurnoDelDia(dia);
            const mallaItem = getMallaItemDelDia(dia);
            const estilo = clasificarMalla(mallaItem);
            const hoy = isToday(dia);
            const esDomingo = getDay(dia) === 0;
            return (
              <div
                key={dia.toISOString()}
                className={`bg-white dark:bg-[#1A2340] border border-gray-200 dark:border-[#3A4565] p-1 sm:p-2 min-h-[88px] sm:min-h-[110px] transition-colors hover:bg-gray-50 dark:hover:bg-[#243052] ${hoy ? "ring-2 ring-primary-500 dark:ring-[#00D4AA] ring-inset" : ""} ${esDomingo ? "bg-red-50/50 dark:bg-red-950/25" : ""}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs sm:text-sm font-bold ${hoy ? "bg-primary-600 text-white w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center" : esDomingo ? "text-red-500 dark:text-red-400" : "text-gray-700 dark:text-[#CBD5E1]"}`}>
                    {format(dia, "d")}
                  </span>
                </div>
                {estilo && (
                  <div className={`text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 rounded border font-semibold leading-tight break-words ${estilo.classes}`}>
                    <span className="hidden sm:inline">{estilo.emoji} </span>
                    {estilo.etiqueta}
                    {mallaItem?.tipo === "TRABAJO" && mallaItem.horaInicio && mallaItem.horaFin && (
                      <div className="text-[9px] sm:text-[10px] font-normal opacity-90 mt-0.5">
                        {mallaItem.horaInicio}-{mallaItem.horaFin}
                      </div>
                    )}
                  </div>
                )}
                {turno && (
                  <div className="text-[9px] sm:text-[10px] space-y-0.5 mt-0.5">
                    <div className="text-green-700 dark:text-[#00D4AA] bg-green-50 dark:bg-[#00D4AA]/15 px-1 sm:px-1.5 py-0.5 rounded truncate font-medium">
                      {new Date(turno.horaEntrada).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })} - {turno.horaSalida ? new Date(turno.horaSalida).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }) : "..."}
                    </div>
                    {turno.horasOrdinarias > 0 && <div className="text-gray-500 dark:text-[#A0AEC0]">{turno.horasOrdinarias}h ord</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:gap-3 text-xs">
        {[
          { etiqueta: "Trabajo", emoji: "🔵", color: "bg-blue-100 dark:bg-blue-900/40" },
          { etiqueta: "Disponible", emoji: "🟢", color: "bg-green-100 dark:bg-green-900/40" },
          { etiqueta: "Descanso", emoji: "💤", color: "bg-gray-100 dark:bg-[#1E2A45]" },
          { etiqueta: "Vacaciones", emoji: "🏖️", color: "bg-sky-100 dark:bg-sky-950/40" },
          { etiqueta: "Incapacitado", emoji: "🩺", color: "bg-orange-100 dark:bg-orange-950/40" },
          { etiqueta: "Día Familia", emoji: "👨‍👩‍👧", color: "bg-purple-100 dark:bg-purple-950/40" },
          { etiqueta: "½ Cumpleaños", emoji: "🎂", color: "bg-pink-100 dark:bg-pink-950/40" },
        ].map((l) => (
          <div key={l.etiqueta} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded border border-gray-300 dark:border-[#3A4565] ${l.color}`} />
            <span className="text-gray-600 dark:text-[#A0AEC0]">{l.etiqueta}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
