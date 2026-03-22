"use client";

import { useSession } from "next-auth/react";
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

interface MallaItem {
  userId: string;
  fecha: string;
  valor: string;
}

const valorColors: Record<string, string> = {
  Disponible: "bg-yellow-100 text-yellow-800 border-yellow-200",
  Vacaciones: "bg-green-100 text-green-800 border-green-200",
  Descanso: "bg-gray-100 text-gray-600 border-gray-200",
  "Día de la familia": "bg-pink-100 text-pink-800 border-pink-200",
  "Semana Santa": "bg-purple-100 text-purple-800 border-purple-200",
  "Medio día cumpleaños": "bg-orange-100 text-orange-800 border-orange-200",
};

export default function CalendarioPage() {
  const { data: session } = useSession();
  const [mesActual, setMesActual] = useState(new Date());
  const [turnos, setTurnos] = useState<TurnoEntry[]>([]);
  const [malla, setMalla] = useState<MallaItem[]>([]);
  const [loading, setLoading] = useState(true);

  const mesKey = format(mesActual, "yyyy-MM");

  useEffect(() => {
    if (!session?.user?.userId) return;
    const inicio = format(startOfMonth(mesActual), "yyyy-MM-dd");
    const fin = format(endOfMonth(mesActual), "yyyy-MM-dd");
    setLoading(true);
    Promise.all([
      fetch(`/api/turnos?userId=${session.user.userId}&inicio=${inicio}&fin=${fin}`).then(async (r) => {
        const j = await parseResponseJson<TurnoEntry[]>(r);
        return Array.isArray(j) ? j : [];
      }),
      fetch(`/api/malla?userId=${session.user.userId}&mes=${mesKey}`).then(async (r) => {
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
  }, [session?.user?.userId, mesActual, mesKey]);

  const dias = eachDayOfInterval({ start: startOfMonth(mesActual), end: endOfMonth(mesActual) });
  const primerDia = getDay(startOfMonth(mesActual));
  const offsetDias = primerDia === 0 ? 6 : primerDia - 1;

  const mallaMap = useMemo(() => {
    const map = new Map<string, string>();
    malla.forEach((m) => map.set(m.fecha, m.valor));
    return map;
  }, [malla]);

  const getTurnoDelDia = (fecha: Date) => {
    const fechaStr = format(fecha, "yyyy-MM-dd");
    return turnos.find((t) => t.fecha.startsWith(fechaStr));
  };

  const getMallaDelDia = (fecha: Date) => {
    const key = `${format(fecha, "yyyy")}-${String(format(fecha, "M")).padStart(2, "0")}-${String(format(fecha, "d")).padStart(2, "0")}`;
    return mallaMap.get(key) ?? "";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Calendario</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setMesActual(subMonths(mesActual, 1))} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">
            <HiChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-lg font-semibold text-gray-900 min-w-[180px] text-center capitalize">
            {format(mesActual, "MMMM yyyy", { locale: es })}
          </span>
          <button onClick={() => setMesActual(addMonths(mesActual, 1))} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">
            <HiChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="card p-4">
        <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((dia) => (
            <div key={dia} className="bg-gray-50 py-2 text-center text-xs font-semibold text-gray-500 uppercase">{dia}</div>
          ))}
          {Array.from({ length: offsetDias }).map((_, i) => (
            <div key={`empty-${i}`} className="bg-white p-2 min-h-[100px]" />
          ))}
          {dias.map((dia) => {
            const turno = getTurnoDelDia(dia);
            const mallaValor = getMallaDelDia(dia);
            const hoy = isToday(dia);
            const esDomingo = getDay(dia) === 0;
            const mallaClasses = mallaValor && valorColors[mallaValor] ? valorColors[mallaValor] : mallaValor ? "bg-gray-100 text-gray-700 border-gray-200" : "";
            return (
              <div key={dia.toISOString()} className={`bg-white p-2 min-h-[100px] transition-colors ${hoy ? "ring-2 ring-primary-500 ring-inset" : ""} ${esDomingo ? "bg-red-50/50" : ""}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-medium ${hoy ? "bg-primary-600 text-white w-7 h-7 rounded-full flex items-center justify-center" : esDomingo ? "text-red-500" : "text-gray-700"}`}>
                    {format(dia, "d")}
                  </span>
                </div>
                {mallaValor && (
                  <div className={`text-[10px] px-1.5 py-0.5 rounded truncate border ${mallaClasses}`}>
                    {mallaValor}
                  </div>
                )}
                {turno && (
                  <div className="text-[10px] space-y-0.5 mt-0.5">
                    <div className="text-green-700 bg-green-50 px-1.5 py-0.5 rounded truncate">
                      {new Date(turno.horaEntrada).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })} - {turno.horaSalida ? new Date(turno.horaSalida).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }) : "..."}
                    </div>
                    {turno.horasOrdinarias > 0 && <div className="text-gray-500">{turno.horasOrdinarias}h ord</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        {Object.entries(valorColors).map(([key, classes]) => (
          <div key={key} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded ${classes.split(" ")[0]}`} />
            <span className="text-xs text-gray-600">{key}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
