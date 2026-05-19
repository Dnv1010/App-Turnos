"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, startOfWeek, addDays, addWeeks } from "date-fns";
import { es } from "date-fns/locale";
import { HiChevronLeft, HiChevronRight, HiCalendar } from "react-icons/hi";
import { parseResponseJson } from "@/lib/parseFetchJson";
import { getZonaLabel } from "@/lib/roleLabels";

type Zona = "BOGOTA" | "COSTA";
type Filtro = "ALL" | Zona;

interface MallaCelda {
  shiftCode: string;
  dayType: string | null;
}

interface TecnicoMalla {
  id: string;
  fullName: string;
  documentNumber: string | null;
  zone: Zona;
  jobTitle: string;
  malla: Record<string, MallaCelda>;
}

interface SemanaInfo {
  inicio: string;
  fin: string;
  dias: string[];
  festivos: Record<string, string>;
}

interface RespuestaMalla {
  semana: SemanaInfo;
  tecnicos: TecnicoMalla[];
}

const DIAS_LABEL = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Estilo por tipo de día. Devuelve clases tailwind. */
function estiloCelda(celda: MallaCelda | undefined, esFestivo: boolean): {
  bg: string;
  text: string;
  contenido: string;
} {
  if (!celda) {
    return {
      bg: esFestivo ? "bg-amber-50 dark:bg-amber-900/20" : "bg-white dark:bg-[#1A2340]",
      text: "text-gray-400 dark:text-gray-500",
      contenido: "—",
    };
  }
  const tipo = (celda.dayType ?? "TRABAJO").toUpperCase();
  const valor = celda.shiftCode || "";
  switch (tipo) {
    case "DESCANSO":
      return { bg: "bg-gray-200 dark:bg-gray-700", text: "text-gray-700 dark:text-gray-200", contenido: "DESC" };
    case "DISPONIBLE":
      return { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-800 dark:text-emerald-200", contenido: "DISP" };
    case "VACACIONES":
      return { bg: "bg-yellow-100 dark:bg-yellow-900/40", text: "text-yellow-900 dark:text-yellow-200", contenido: "VAC" };
    case "DIA_FAMILIA":
      return { bg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-800 dark:text-purple-200", contenido: "FAM" };
    case "INCAPACITADO":
      return { bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-800 dark:text-red-200", contenido: "INC" };
    case "MEDIO_CUMPLE":
      return { bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-800 dark:text-orange-200", contenido: "M/C" };
    default:
      // TRABAJO o cualquier código de turno
      return {
        bg: esFestivo
          ? "bg-amber-100 dark:bg-amber-900/40"
          : "bg-blue-50 dark:bg-blue-950/40",
        text: esFestivo ? "text-amber-900 dark:text-amber-200" : "text-blue-900 dark:text-blue-200",
        contenido: valor || "TRAB",
      };
  }
}

function lunesDeLaSemana(fecha: Date): Date {
  return startOfWeek(fecha, { weekStartsOn: 1 });
}

function ymd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export default function ManagerMallaPage() {
  const [inicioSemana, setInicioSemana] = useState<Date>(lunesDeLaSemana(new Date()));
  const [zona, setZona] = useState<Filtro>("ALL");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RespuestaMalla | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/manager/malla-semanal?inicio=${ymd(inicioSemana)}&zona=${zona}`
      );
      const parsed = await parseResponseJson<RespuestaMalla | { error?: string }>(res);
      if (!res.ok) {
        const msg = (parsed as { error?: string })?.error ?? `Error ${res.status}`;
        setError(msg);
        setData(null);
        return;
      }
      setData(parsed as RespuestaMalla);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [inicioSemana, zona]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const tecnicosPorZona = useMemo(() => {
    if (!data) return { BOGOTA: [], COSTA: [] } as Record<Zona, TecnicoMalla[]>;
    const grupos: Record<Zona, TecnicoMalla[]> = { BOGOTA: [], COSTA: [] };
    for (const t of data.tecnicos) {
      if (t.zone === "BOGOTA" || t.zone === "COSTA") {
        grupos[t.zone].push(t);
      }
    }
    return grupos;
  }, [data]);

  function semanaAnterior() {
    setInicioSemana((d) => addWeeks(d, -1));
  }
  function semanaSiguiente() {
    setInicioSemana((d) => addWeeks(d, 1));
  }
  function irHoy() {
    setInicioSemana(lunesDeLaSemana(new Date()));
  }

  const finSemana = useMemo(() => addDays(inicioSemana, 6), [inicioSemana]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
          Malla semanal — Técnicos
        </h1>
        <p className="text-sm text-gray-600 dark:text-[#A0AEC0] mt-1">
          Visualización de turnos asignados por semana. Filas: técnicos. Columnas: días Lun-Dom.
        </p>
      </div>

      {/* Controles */}
      <div className="bg-white dark:bg-[#1A2340] border border-gray-200 dark:border-[#3A4565] rounded-lg p-3 sm:p-4 flex flex-wrap gap-3 items-center">
        <button
          onClick={semanaAnterior}
          className="p-2 rounded hover:bg-gray-100 dark:hover:bg-[#243052]"
          aria-label="Semana anterior"
        >
          <HiChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 font-medium">
          <HiCalendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <span>
            {format(inicioSemana, "d 'de' LLL", { locale: es })} —{" "}
            {format(finSemana, "d 'de' LLL yyyy", { locale: es })}
          </span>
        </div>
        <button
          onClick={semanaSiguiente}
          className="p-2 rounded hover:bg-gray-100 dark:hover:bg-[#243052]"
          aria-label="Semana siguiente"
        >
          <HiChevronRight className="w-5 h-5" />
        </button>
        <button
          onClick={irHoy}
          className="px-3 py-1.5 rounded border border-gray-300 dark:border-[#3A4565] text-sm hover:bg-gray-50 dark:hover:bg-[#243052]"
        >
          Hoy
        </button>

        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-[#A0AEC0]">Zona:</label>
          <select
            value={zona}
            onChange={(e) => setZona(e.target.value as Filtro)}
            className="border border-gray-300 dark:border-[#3A4565] rounded px-2 py-1 text-sm bg-white dark:bg-[#162035] dark:text-white"
          >
            <option value="ALL">Todas (Bogotá + Costa)</option>
            <option value="BOGOTA">Bogotá</option>
            <option value="COSTA">Costa</option>
          </select>
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-600 dark:text-[#A0AEC0]">
        <Leyenda color="bg-blue-50 dark:bg-blue-950/40" label="Trabajo" />
        <Leyenda color="bg-gray-200 dark:bg-gray-700" label="Descanso" />
        <Leyenda color="bg-emerald-100 dark:bg-emerald-900/40" label="Disponible" />
        <Leyenda color="bg-yellow-100 dark:bg-yellow-900/40" label="Vacaciones" />
        <Leyenda color="bg-purple-100 dark:bg-purple-900/40" label="Día familia" />
        <Leyenda color="bg-red-100 dark:bg-red-900/40" label="Incapacidad" />
        <Leyenda color="bg-amber-100 dark:bg-amber-900/40" label="Festivo" />
      </div>

      {/* Estado */}
      {loading && (
        <div className="text-center py-10 text-gray-500 dark:text-[#A0AEC0]">Cargando malla…</div>
      )}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-800 dark:text-red-200 rounded p-3 text-sm">
          {error}
        </div>
      )}

      {/* Tablas por zona */}
      {!loading && !error && data && (
        <>
          {(["BOGOTA", "COSTA"] as Zona[])
            .filter((z) => zona === "ALL" || zona === z)
            .map((z) => (
              <TablaZona
                key={z}
                zona={z}
                tecnicos={tecnicosPorZona[z]}
                semana={data.semana}
              />
            ))}
        </>
      )}
    </div>
  );
}

function Leyenda({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block w-3 h-3 rounded ${color}`} />
      {label}
    </span>
  );
}

function TablaZona({
  zona,
  tecnicos,
  semana,
}: {
  zona: Zona;
  tecnicos: TecnicoMalla[];
  semana: SemanaInfo;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
        {getZonaLabel(zona)} ({tecnicos.length})
      </h2>
      {tecnicos.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-[#A0AEC0] bg-white dark:bg-[#1A2340] border border-gray-200 dark:border-[#3A4565] rounded p-4">
          No hay técnicos activos en esta zona.
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 dark:border-[#3A4565] rounded-lg bg-white dark:bg-[#1A2340]">
          <table className="min-w-full text-xs sm:text-sm border-collapse">
            <thead className="bg-gray-50 dark:bg-[#162035] text-gray-600 dark:text-[#A0AEC0] sticky top-0">
              <tr>
                <th className="text-left p-2 border-r border-gray-200 dark:border-[#3A4565] sticky left-0 bg-gray-50 dark:bg-[#162035] z-10 min-w-[180px]">
                  Técnico
                </th>
                {semana.dias.map((dia, i) => {
                  const esFestivo = !!semana.festivos[dia];
                  return (
                    <th
                      key={dia}
                      className={`text-center p-2 border-r border-gray-200 dark:border-[#3A4565] last:border-r-0 min-w-[60px] ${
                        esFestivo ? "bg-amber-50 dark:bg-amber-900/20" : ""
                      }`}
                      title={esFestivo ? semana.festivos[dia] : undefined}
                    >
                      <div className="font-medium">{DIAS_LABEL[i]}</div>
                      <div className="text-[10px] text-gray-500 dark:text-[#A0AEC0]">
                        {dia.slice(8, 10)}/{dia.slice(5, 7)}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {tecnicos.map((t) => (
                <tr key={t.id} className="border-t border-gray-100 dark:border-[#2A3555]">
                  <td className="p-2 border-r border-gray-200 dark:border-[#3A4565] sticky left-0 bg-white dark:bg-[#1A2340] z-10">
                    <div className="font-medium text-gray-900 dark:text-white">{t.fullName}</div>
                    {t.documentNumber && (
                      <div className="text-[10px] font-mono text-gray-500 dark:text-[#A0AEC0]">
                        {t.documentNumber}
                      </div>
                    )}
                  </td>
                  {semana.dias.map((dia) => {
                    const esFestivo = !!semana.festivos[dia];
                    const celda = t.malla[dia];
                    const { bg, text, contenido } = estiloCelda(celda, esFestivo);
                    return (
                      <td
                        key={dia}
                        className={`text-center p-1.5 border-r border-gray-100 dark:border-[#2A3555] last:border-r-0 ${bg} ${text}`}
                        title={
                          celda
                            ? `${celda.dayType ?? "TRABAJO"} — ${celda.shiftCode || "(sin código)"}`
                            : esFestivo
                              ? `Festivo: ${semana.festivos[dia]}`
                              : "Sin malla asignada"
                        }
                      >
                        <span className="font-mono text-xs sm:text-sm">{contenido}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
