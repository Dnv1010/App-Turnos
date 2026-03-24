"use client";

import { useEffect, useRef, useState } from "react";
import {
  getAlertaJornadaAt,
  etiquetaJornadaEsperada,
  jornadaTotalMsDesdeEntrada,
  mensajeCuerpoOperador15min,
  primerNombreOperador,
} from "@/lib/jornada-alerta";
import { useToast } from "@/components/ui/Toast";
import { HiClock } from "react-icons/hi";

type Step = "closed" | "open";

function storageKeyHandled(turnoId: string) {
  return `jornada-alerta-handled-${turnoId}`;
}

interface Props {
  turnoActivo: { id: string; horaEntrada: string; userId: string } | null;
  /** Nombre del operador (sesión) para personalizar toast / modal / Notification local */
  operadorNombre?: string;
  onAfterReport?: () => void;
}

const TITULO_ALERTA = "⏰ Jornada por finalizar";

export default function JornadaAlertaFlow({ turnoActivo, operadorNombre = "" }: Props) {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const operadorNombreRef = useRef(operadorNombre);
  operadorNombreRef.current = operadorNombre;

  const userIdRef = useRef<string | undefined>(turnoActivo?.userId);
  userIdRef.current = turnoActivo?.userId;

  const [step, setStep] = useState<Step>("closed");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertaFiredRef = useRef(false);
  const lastTurnoKeyRef = useRef<string | null>(null);

  const turnoId = turnoActivo?.id;
  const horaEntrada = turnoActivo?.horaEntrada;

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setStep("closed");

    if (!turnoId || !horaEntrada) {
      lastTurnoKeyRef.current = null;
      alertaFiredRef.current = false;
      return;
    }

    const uid = userIdRef.current;
    if (!uid) return;

    const turnoKey = `${turnoId}:${horaEntrada}`;
    if (lastTurnoKeyRef.current !== turnoKey) {
      alertaFiredRef.current = false;
      lastTurnoKeyRef.current = turnoKey;
    }

    if (sessionStorage.getItem(storageKeyHandled(turnoId))) {
      return;
    }

    const entrada = new Date(horaEntrada);
    const alertAt = getAlertaJornadaAt(entrada);
    const delay = alertAt.getTime() - Date.now();

    const disparar = () => {
      if (typeof window === "undefined") return;
      if (alertaFiredRef.current) return;
      if (sessionStorage.getItem(storageKeyHandled(turnoId))) {
        setStep("closed");
        return;
      }
      alertaFiredRef.current = true;

      void fetch("/api/push/send-alerta-jornada", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid }),
      }).catch(() => {});

      setStep("open");
      const primer = primerNombreOperador(operadorNombreRef.current);
      const cuerpoAmigable = mensajeCuerpoOperador15min(primer);
      toastRef.current.info(TITULO_ALERTA, cuerpoAmigable, { duration: 15000 });
      if (Notification.permission === "granted") {
        try {
          new Notification(TITULO_ALERTA, {
            body: cuerpoAmigable,
            icon: "/icon-192.png",
            tag: `jornada-ui-${turnoId}`,
          });
        } catch {
          /* ignore */
        }
      }
    };

    if (delay <= 0) {
      disparar();
      return;
    }

    if (delay > 1000 * 60 * 60 * 24) return;

    timerRef.current = setTimeout(disparar, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [turnoId, horaEntrada]);

  if (!turnoActivo || step === "closed") return null;

  const entrada = new Date(turnoActivo.horaEntrada);
  const horaFin = new Date(entrada.getTime() + jornadaTotalMsDesdeEntrada(entrada));
  const textoAmigable = mensajeCuerpoOperador15min(primerNombreOperador(operadorNombre));

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 dark:bg-black/70"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <div
        className="bg-white dark:bg-[#1A2340] rounded-2xl shadow-2xl dark:shadow-black/40 max-w-md w-full overflow-hidden border-2 border-amber-400 dark:border-amber-600/80"
        style={{ transform: "translateZ(0)" }}
      >
        <div className="bg-amber-50 dark:bg-amber-950/50 px-4 py-3 border-b border-amber-200 dark:border-amber-800 flex items-center gap-2">
          <HiClock className="h-6 w-6 text-amber-700 dark:text-amber-400" />
          <h3 className="font-bold text-amber-900 dark:text-amber-100">Fin de jornada</h3>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-base font-medium text-gray-900 dark:text-white">{textoAmigable}</p>
          <p className="text-sm text-gray-700 dark:text-gray-200">
            Jornada prevista: {etiquetaJornadaEsperada(entrada)}. Hora referencia de cierre:{" "}
            <strong>
              {horaFin.toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })}
            </strong>{" "}
            (Colombia).
          </p>
          <button
            type="button"
            className="btn-primary w-full"
            onClick={() => {
              sessionStorage.setItem(storageKeyHandled(turnoActivo.id), "1");
              fetch("/api/turnos/alerta-handled", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ turnoId: turnoActivo.id }),
              }).catch(() => {});
              setStep("closed");
            }}
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
