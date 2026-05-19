"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, startOfWeek, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { HiCalendar } from "react-icons/hi";
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

interface RangoInfo {
  desde: string;
  hasta: string;
  dias: string[];
  festivos: Record<string, string>;
}

interface RespuestaMalla {
  rango: RangoInfo;
  tecnicos: TecnicoMalla[];
}

const DIAS_LABEL_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

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
      return {
        bg: esFestivo
          ? "bg-amber-100 dark:bg-amber-900/40"
          : "bg-blue-50 dark:bg-blue-950/40",
        text: esFestivo ? "text-amber-900 dark:text-amber-200" : "text-blue-900 dark:text-blue-200",
        contenido: valor || "TRAB",
      };
  }
}

function ymd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** Día de semana del YYYY-MM-DD interpretado como midnight UTC. 0=Dom, 1=Lun ... */
function dowDeYmd(ymdStr: string): number {
  const [y, m, d] = ymdStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export default function ManagerMallaPage() {
  // Por defecto: semana actual (lunes a domingo).
  const hoy = new Date();
  const lunes = startOfWeek(hoy, { weekStartsOn: 1 });
  const [desde, setDesde] = useState<string>(ymd(lunes));
  const [hasta, setHasta] = useState<string>(ymd(addDays(lunes, 6)));
  const [zona, setZona] = useState<Filtro>("ALL");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RespuestaMalla | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!desde || !hasta) return;
    if (hasta < desde) {
      setError("La fecha 'hasta' debe ser mayor o igual a 'desde'");
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/manager/malla-semanal?desde=${desde}&hasta=${hasta}&zona=${zona}`
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
  }, [desde, hasta, zona]);

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

  function ajustarPreset(preset: "semana" | "mes" | "mesAnterior") {
    const ahora = new Date();
    if (preset === "semana") {
      const l = startOfWeek(ahora, { weekStartsOn: 1 });
      setDesde(ymd(l));
      setHasta(ymd(addDays(l, 6)));
    } else if (preset === "mes") {
      const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      const fin = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0);
      setDesde(ymd(inicio));
      setHasta(ymd(fin));
    } else {
      const inicio = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
      const fin = new Date(ahora.getFullYear(), ahora.getMonth(), 0);
      setDesde(ymd(inicio));
      setHasta(ymd(fin));
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
          Malla de turnos — Técnicos
        </h1>
        <p className="text-sm text-gray-600 dark:text-[#A0AEC0] mt-1">
          Visualización por rango de fechas. Filas: técnicos. Columnas: días del rango.
        </p>
      </div>

      {/* Controles */}
      <div className="bg-white dark:bg-[#1A2340] border border-gray-200 dark:border-[#3A4565] rounded-lg p-3 sm:p-4 flex flex-wrap gap-3 items-end">
        <div className="flex items-end gap-2">
          <HiCalendar className="w-5 h-5 mb-2 text-blue-600 dark:text-blue-400 shrink-0" />
          <div>
            <label className="block text-xs text-gray-600 dark:text-[#A0AEC0] mb-1">Desde</label>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="border border-gray-300 dark:border-[#3A4565] rounded px-2 py-1.5 text-sm bg-white dark:bg-[#162035] dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-[#A0AEC0] mb-1">Hasta</label>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="border border-gray-300 dark:border-[#3A4565] rounded px-2 py-1.5 text-sm bg-white dark:bg-[#162035] dark:text-white"
            />
          </div>
        </div>

        <div className="flex items-end gap-2">
          <button
            onClick={() => ajustarPreset("semana")}
            className="px-3 py-1.5 rounded border border-gray-300 dark:border-[#3A4565] text-sm hover:bg-gray-50 dark:hover:bg-[#243052]"
          >
            Esta semana
          </button>
          <button
            onClick={() => ajustarPreset("mes")}
            className="px-3 py-1.5 rounded border border-gray-300 dark:border-[#3A4565] text-sm hover:bg-gray-50 dark:hover:bg-[#243052]"
          >
            Este mes
          </button>
          <button
            onClick={() => ajustarPreset("mesAnterior")}
            className="px-3 py-1.5 rounded border border-gray-300 dark:border-[#3A4565] text-sm hover:bg-gray-50 dark:hover:bg-[#243052]"
          >
            Mes anterior
          </button>
        </div>

        <div className="ml-auto flex items-end gap-2">
          <div>
            <label className="block text-xs text-gray-600 dark:text-[#A0AEC0] mb-1">Zona</label>
            <select
              value={zona}
              onChange={(e) => setZona(e.target.value as Filtro)}
              className="border border-gray-300 dark:border-[#3A4565] rounded px-2 py-1.5 text-sm bg-white dark:bg-[#162035] dark:text-white"
            >
              <option value="ALL">Todas (Bogotá + Costa)</option>
              <option value="BOGOTA">Bogotá</option>
              <option value="COSTA">Costa</option>
            </select>
          </div>
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

      {loading && (
        <div className="text-center py-10 text-gray-500 dark:text-[#A0AEC0]">Cargando malla…</div>
      )}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-800 dark:text-red-200 rounded p-3 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {(["BOGOTA", "COSTA"] as Zona[])
            .filter((z) => zona === "ALL" || zona === z)
            .map((z) => (
              <TablaZona
                key={z}
                zona={z}
                tecnicos={tecnicosPorZona[z]}
                rango={data.rango}
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
  rango,
}: {
  zona: Zona;
  tecnicos: TecnicoMalla[];
  rango: RangoInfo;
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
                {rango.dias.map((dia) => {
                  const esFestivo = !!rango.festivos[dia];
                  const dow = dowDeYmd(dia);
                  return (
                    <th
                      key={dia}
                      className={`text-center p-2 border-r border-gray-200 dark:border-[#3A4565] last:border-r-0 min-w-[60px] ${
                        esFestivo ? "bg-amber-50 dark:bg-amber-900/20" : ""
                      } ${dow === 0 ? "bg-red-50/30 dark:bg-red-900/10" : ""}`}
                      title={esFestivo ? rango.festivos[dia] : undefined}
                    >
                      <div className="font-medium">{DIAS_LABEL_CORTO[dow]}</div>
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
                  {rango.dias.map((dia) => {
                    const esFestivo = !!rango.festivos[dia];
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
                              ? `Festivo: ${rango.festivos[dia]}`
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
