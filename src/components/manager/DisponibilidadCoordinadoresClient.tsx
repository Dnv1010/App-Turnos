"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { parseResponseJson } from "@/lib/parseFetchJson";
import { VALOR_DISPONIBILIDAD_COORDINADOR } from "@/lib/reporteDisponibilidadValor";
import { getZonaLabel } from "@/lib/roleLabels";

type CoordUser = { id: string; nombre: string; cedula: string; zona: string; role: string };
type DispoRow = {
  id: string;
  fecha: string;
  userId: string;
  valor: string;
  user: CoordUser;
};
type DispoTablaRow = {
  id: string;
  fecha: string;
  monto: number;
  userId: string;
  user: CoordUser;
};

export default function DisponibilidadCoordinadoresClient() {
  const [zona, setZona] = useState<"ALL" | "BOGOTA" | "COSTA" | "INTERIOR">("ALL");
  const [mes, setMes] = useState(() => format(new Date(), "yyyy-MM"));
  const [userId, setUserId] = useState("");
  const [coordinadores, setCoordinadores] = useState<CoordUser[]>([]);
  const [disponibilidades, setDisponibilidades] = useState<DispoRow[]>([]);
  const [disponibilidadesTabla, setDisponibilidadesTabla] = useState<DispoTablaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
    setMsg(null);
    try {
      const q = new URLSearchParams({ desde, hasta });
      if (zona !== "ALL") q.set("zona", zona);
      const res = await fetch(`/api/disponibilidad-coordinadores?${q}`);
      const data = await parseResponseJson<{
        coordinadores: CoordUser[];
        disponibilidades: DispoRow[];
        disponibilidadesTabla: DispoTablaRow[];
      }>(res);
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Error");
      setCoordinadores(data?.coordinadores ?? []);
      setDisponibilidades(data?.disponibilidades ?? []);
      setDisponibilidadesTabla(data?.disponibilidadesTabla ?? []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
      setCoordinadores([]);
      setDisponibilidades([]);
      setDisponibilidadesTabla([]);
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, zona]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (coordinadores.length === 0) {
      setUserId("");
      return;
    }
    if (!userId || !coordinadores.some((c) => c.id === userId)) {
      setUserId(coordinadores[0]!.id);
    }
  }, [coordinadores, userId]);

  const fechasMarcadas = useMemo(() => {
    const s = new Set<string>();
    disponibilidades
      .filter((d) => d.userId === userId)
      .forEach((d) => {
        const k = d.fecha.split("T")[0];
        if (k) s.add(k);
      });
    return s;
  }, [disponibilidades, userId]);

  const diasEnMes = useMemo(() => {
    const [y, m] = mes.split("-").map(Number);
    const n = new Date(y, m, 0).getDate();
    return Array.from({ length: n }, (_, i) => format(new Date(y, m - 1, i + 1), "yyyy-MM-dd"));
  }, [mes]);

  const totalMes = useMemo(() => {
    return diasEnMes.filter((d) => fechasMarcadas.has(d)).length;
  }, [diasEnMes, fechasMarcadas]);

  async function toggleDia(ymd: string) {
    if (!userId || saving) return;
    setSaving(true);
    setMsg(null);
    const marcar = !fechasMarcadas.has(ymd);
    try {
      const res = await fetch("/api/disponibilidad-coordinadores", {
        method: marcar ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, fechas: [ymd] }),
      });
      const data = await parseResponseJson(res);
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Error");
      await cargar();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  const [y, mm] = mes.split("-").map(Number);
  const firstDow = new Date(y, mm - 1, 1).getDay();
  const daysInMonth = new Date(y, mm, 0).getDate();
  const blanks = (firstDow + 6) % 7;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Disponibilidad líderes de zona</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-[#A0AEC0]">
          Marca días disponibles por líder de zona. Valor diario ${VALOR_DISPONIBILIDAD_COORDINADOR.toLocaleString("es-CO")} COP.
        </p>
      </div>

      {msg && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800">{msg}</div>
      )}

      <div className="flex flex-wrap gap-4 rounded-xl border border-gray-200 dark:border-[#3A4565] bg-white dark:bg-[#1A2340] p-4 shadow-sm dark:shadow-black/30">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-[#A0AEC0]">Zona</label>
          <select
            className="rounded-lg border border-gray-300 dark:border-[#3A4565] px-3 py-2 text-sm dark:bg-[#1E2A45] dark:text-white"
            value={zona}
            onChange={(e) => setZona(e.target.value as typeof zona)}
          >
            <option value="ALL">Todas</option>
            <option value="BOGOTA">Bogotá</option>
            <option value="COSTA">Costa</option>
            <option value="INTERIOR">Interior</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-[#A0AEC0]">Líder de zona</label>
          <select
            className="min-w-[220px] rounded-lg border border-gray-300 dark:border-[#3A4565] px-3 py-2 text-sm dark:bg-[#1E2A45] dark:text-white"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">Seleccionar…</option>
            {coordinadores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({getZonaLabel(c.zona)})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-[#A0AEC0]">Mes</label>
          <input
            type="month"
            className="rounded-lg border border-gray-300 dark:border-[#3A4565] px-3 py-2 text-sm dark:bg-[#1E2A45] dark:text-white"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => void cargar()}
            className="rounded-lg border border-gray-300 dark:border-[#3A4565] px-4 py-2 text-sm text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-[#243052]"
          >
            Actualizar
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-[#3A4565] bg-white dark:bg-[#1A2340] p-6 shadow-sm dark:shadow-black/30">
        <p className="text-sm text-gray-600 dark:text-[#A0AEC0] mb-4">
          Clic en un día para marcar o quitar disponibilidad.
          {saving && <span className="ml-2 text-primary-600">Guardando…</span>}
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
          </div>
        ) : !userId ? (
          <p className="text-sm text-gray-500 dark:text-[#A0AEC0]">Selecciona un líder de zona.</p>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-gray-500 dark:text-[#A0AEC0] mb-1">
              {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
                <div key={d} className="py-2 bg-gray-50 dark:bg-[#162035] rounded">
                  {d}
                </div>
              ))}
              {Array.from({ length: blanks }).map((_, i) => (
                <div key={`b-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const key = format(new Date(y, mm - 1, day), "yyyy-MM-dd");
                const on = fechasMarcadas.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={saving}
                    onClick={() => void toggleDia(key)}
                    className={`rounded-lg border py-2 text-sm transition-colors ${
                      on
                        ? "border-green-600 dark:border-[#00D4AA]/50 bg-green-100 dark:bg-[#00D4AA]/15 font-semibold text-green-900 dark:text-[#00D4AA] hover:bg-green-200 dark:hover:bg-[#00D4AA]/25"
                        : "border-gray-200 dark:border-[#3A4565] bg-white dark:bg-[#1A2340] text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-[#243052]"
                    } disabled:opacity-50`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 rounded-lg bg-gray-50 dark:bg-[#0F1629] p-4 text-sm text-gray-800 dark:text-white border border-gray-100 dark:border-[#2A3555] space-y-1">
              <div>
                <span className="font-medium">Días disponibles en el mes:</span> {totalMes}
              </div>
              <div>
                <span className="font-medium">Valor por día:</span> $
                {VALOR_DISPONIBILIDAD_COORDINADOR.toLocaleString("es-CO")}
              </div>
              <div>
                <span className="font-medium">Total a pagar (mes):</span> $
                {(totalMes * VALOR_DISPONIBILIDAD_COORDINADOR).toLocaleString("es-CO")}
              </div>
            </div>
          </>
        )}
      </div>

      {userId && disponibilidades.filter((d) => d.userId === userId).length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-[#3A4565] bg-white dark:bg-[#1A2340] p-4 shadow-sm dark:shadow-black/30">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Registro del mes</h3>
          <ul className="text-sm text-gray-600 dark:text-[#A0AEC0] space-y-1">
            {disponibilidades
              .filter((d) => d.userId === userId)
              .map((d) => (
                <li key={d.id}>
                  {format(parseISO(d.fecha.split("T")[0]), "EEEE d MMMM", { locale: es })}
                </li>
              ))}
          </ul>
        </div>
      )}

      {userId && disponibilidadesTabla.filter((d) => d.userId === userId).length > 0 && (
        <div className="rounded-xl border border-blue-200 dark:border-[#2A4080] bg-blue-50 dark:bg-[#0F1E40] p-4 shadow-sm dark:shadow-black/30">
          <h3 className="text-sm font-semibold text-blue-800 dark:text-[#60A5FA] mb-3">
            Tabla Disponibilidad — {disponibilidadesTabla.filter((d) => d.userId === userId).length} registro{disponibilidadesTabla.filter((d) => d.userId === userId).length !== 1 ? "s" : ""}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-gray-700 dark:text-[#CBD5E1]">
              <thead>
                <tr className="text-xs text-gray-500 dark:text-[#A0AEC0] border-b border-blue-200 dark:border-[#2A4080]">
                  <th className="py-1 pr-4 text-left font-medium">Fecha</th>
                  <th className="py-1 text-right font-medium">Monto</th>
                </tr>
              </thead>
              <tbody>
                {disponibilidadesTabla
                  .filter((d) => d.userId === userId)
                  .map((d) => (
                    <tr key={d.id} className="border-b border-blue-100 dark:border-[#1A3060] last:border-0">
                      <td className="py-1 pr-4">
                        {format(parseISO(d.fecha.split("T")[0]), "EEEE d MMMM", { locale: es })}
                      </td>
                      <td className="py-1 text-right font-semibold text-blue-700 dark:text-[#60A5FA]">
                        ${d.monto.toLocaleString("es-CO")}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
