"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getAlertaJornadaAt, etiquetaJornadaEsperada, jornadaTotalMsDesdeEntrada } from "@/lib/jornada-alerta";
import { parseResponseJson } from "@/lib/parseFetchJson";
import { HiClock, HiX } from "react-icons/hi";

type Step = "closed" | "pregunta" | "orden" | "cerrar";

function storageKeyHandled(turnoId: string) {
  return `jornada-alerta-handled-${turnoId}`;
}

interface Props {
  turnoActivo: { id: string; horaEntrada: string } | null;
  onAfterReport?: () => void;
}

export default function JornadaAlertaFlow({ turnoActivo, onAfterReport }: Props) {
  const [step, setStep] = useState<Step>("closed");
  const [orden, setOrden] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fireAlert = useCallback(
    (turnoId: string) => {
      if (typeof window === "undefined") return;
      if (sessionStorage.getItem(storageKeyHandled(turnoId))) {
        setStep("closed");
        return;
      }
      setStep("pregunta");
      setErr(null);
      if (Notification.permission === "granted") {
        try {
          new Notification("Turnos BIA — Fin de jornada", {
            body: "Faltan 15 minutos para el fin de tu jornada. Indica si sigues laborando o cierra turno en la app.",
            icon: "/icon-192.png",
            tag: `jornada-ui-${turnoId}`,
          });
        } catch {
          /* ignore */
        }
      }
    },
    []
  );

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setStep("closed");
    setOrden("");
    setErr(null);

    if (!turnoActivo) return;

    const entrada = new Date(turnoActivo.horaEntrada);
    const alertAt = getAlertaJornadaAt(entrada);
    const now = Date.now();
    const delay = alertAt.getTime() - now;

    if (sessionStorage.getItem(storageKeyHandled(turnoActivo.id))) {
      return;
    }

    if (delay <= 0) {
      fireAlert(turnoActivo.id);
      return;
    }

    if (delay > 1000 * 60 * 60 * 24) return;

    timerRef.current = setTimeout(() => fireAlert(turnoActivo.id), delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [turnoActivo, fireAlert]);

  const enviarOrden = async () => {
    if (!turnoActivo) return;
    const t = orden.trim();
    if (!t) {
      setErr("Indica la orden de trabajo.");
      return;
    }
    setSending(true);
    setErr(null);
    try {
      const res = await fetch("/api/turnos/jornada-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnoId: turnoActivo.id, ordenTrabajo: t }),
      });
      const data = await parseResponseJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !data?.ok) {
        setErr(data?.error || "No se pudo guardar");
        setSending(false);
        return;
      }
      sessionStorage.setItem(storageKeyHandled(turnoActivo.id), "1");
      setStep("closed");
      onAfterReport?.();
    } catch {
      setErr("Error de red");
    }
    setSending(false);
  };

  const irCerrarTurno = () => {
    if (!turnoActivo) return;
    sessionStorage.setItem(storageKeyHandled(turnoActivo.id), "1");
    setStep("cerrar");
    const el = document.getElementById("bloque-fichaje");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (!turnoActivo || step === "closed") return null;

  const entrada = new Date(turnoActivo.horaEntrada);
  const horaFin = new Date(entrada.getTime() + jornadaTotalMsDesdeEntrada(entrada));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border-2 border-amber-400">
        <div className="bg-amber-50 px-4 py-3 border-b border-amber-200 flex items-center gap-2">
          <HiClock className="h-6 w-6 text-amber-700" />
          <h3 className="font-bold text-amber-900">Fin de jornada</h3>
        </div>

        {step === "pregunta" && (
          <div className="p-5 space-y-4">
            <p className="text-sm text-gray-800">
              Faltan <strong>15 minutos</strong> para completar tu jornada prevista ({etiquetaJornadaEsperada(entrada)}). Hora
              referencia de cierre:{" "}
              <strong>
                {horaFin.toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })}
              </strong>{" "}
              (Colombia).
            </p>
            <p className="text-sm font-medium text-gray-900 dark:text-white">¿Sigues laborando?</p>
            <div className="flex flex-col gap-2">
              <button type="button" className="btn-primary w-full" onClick={() => setStep("orden")}>
                Sí, sigo laborando
              </button>
              <button
                type="button"
                className="w-full py-2.5 px-4 rounded-lg border border-gray-300 dark:border-[#3A4565] dark:bg-[#1E2A45] text-gray-800 dark:text-white font-medium hover:bg-gray-50 dark:hover:bg-bia-navy-500"
                onClick={irCerrarTurno}
              >
                No, ya terminé
              </button>
            </div>
          </div>
        )}

        {step === "orden" && (
          <div className="p-5 space-y-4">
            <p className="text-sm text-gray-700 dark:text-bia-label">
              Indica en qué <strong>orden de trabajo</strong> sigues laborando. Tu coordinador verá esta información en las
              observaciones del turno.
            </p>
            <textarea
              className="input-field w-full min-h-[88px] resize-y"
              placeholder="Ej: OT-12345 / Cliente XYZ / Servicio…"
              value={orden}
              onChange={(e) => setOrden(e.target.value)}
            />
            {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-700 dark:border-[#3A4565] dark:bg-[#1E2A45] dark:text-white dark:hover:bg-bia-navy-500"
                onClick={() => setStep("pregunta")}
              >
                Atrás
              </button>
              <button type="button" className="btn-primary flex-1" disabled={sending} onClick={() => void enviarOrden()}>
                {sending ? "Enviando…" : "Enviar reporte"}
              </button>
            </div>
          </div>
        )}

        {step === "cerrar" && (
          <div className="p-5 space-y-4">
            <p className="text-sm text-gray-800 dark:text-white">
              Por favor <strong>cierra tu turno</strong> con el botón rojo <strong>Cerrar turno</strong> (foto de salida +
              ubicación). Así queda registrada tu salida para el coordinador.
            </p>
            <button
              type="button"
              className="btn-primary w-full flex items-center justify-center gap-2"
              onClick={() => setStep("closed")}
            >
              <HiX className="h-5 w-5" />
              Entendido
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
