"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { parseResponseJson } from "@/lib/parseFetchJson";
import { VALOR_DISPONIBILIDAD_COORDINADOR } from "@/lib/reporteDisponibilidadValor";

type DispoRow = {
  id: string;
  fecha: string;
  valor: string;
  user: { nombre: string; cedula: string | null; zona: string; role: string };
};

export default function CoordinadorDisponibilidadTab() {
  const [mes, setMes] = useState(() => format(new Date(), "yyyy-MM"));
  const [items, setItems] = useState<DispoRow[]>([]);
  const [loading, setLoading] = useState(true);

  const { desde, hasta } = useMemo(() => {
    const [y, m] = mes.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    return {
      desde: format(start, "yyyy-MM-dd"),
      hasta: format(end, "yyyy-MM-dd"),
    };
  }, [mes]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/disponibilidad-coordinadores?desde=${desde}&hasta=${hasta}`
      );
      const data = await parseResponseJson<{ disponibilidades: DispoRow[] }>(res);
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Error");
      setItems(data?.disponibilidades ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const fechasSet = useMemo(() => {
    const s = new Set<string>();
    items.forEach((d) => {
      const key = d.fecha.split("T")[0];
      if (key) s.add(key);
    });
    return s;
  }, [items]);

  const [y, mm] = mes.split("-").map(Number);
  const firstDow = new Date(y, mm - 1, 1).getDay();
  const daysInMonth = new Date(y, mm, 0).getDate();
  const blanks = (firstDow + 6) % 7;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-900">Días marcados como disponible</p>
          <p className="text-xs text-gray-500">
            Valor referencia:{" "}
            <span className="font-semibold text-primary-700">
              ${VALOR_DISPONIBILIDAD_COORDINADOR.toLocaleString("es-CO")} / día
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Mes</label>
          <input
            type="month"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-gray-500">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
            {Array.from({ length: blanks }).map((_, i) => (
              <div key={`b-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const key = format(new Date(y, mm - 1, day), "yyyy-MM-dd");
              const on = fechasSet.has(key);
              return (
                <div
                  key={key}
                  className={`rounded-lg border py-2 text-sm ${
                    on
                      ? "border-green-500 bg-green-50 font-semibold text-green-900"
                      : "border-gray-100 bg-gray-50 text-gray-400"
                  }`}
                >
                  {day}
                </div>
              );
            })}
          </div>

          {items.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs font-medium text-gray-500 mb-2">Detalle</p>
              <ul className="text-sm text-gray-700 space-y-1 max-h-40 overflow-y-auto">
                {items.map((d) => (
                  <li key={d.id}>
                    {format(parseISO(d.fecha.split("T")[0]), "EEEE d MMM", { locale: es })} —{" "}
                    {d.valor}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
