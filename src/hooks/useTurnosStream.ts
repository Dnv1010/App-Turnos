import { useEffect, useRef } from "react";

interface TurnoEliminadoEvent {
  id: string;
  usuarioTecnico?: string;
  fecha?: string;
  zona?: string;
  timestamp?: string;
}

type EventHandler = (data: any) => void;

export function useTurnosStream(
  onTurnoEliminado?: EventHandler,
  onTurnoEditado?: EventHandler,
  onTurnoCreado?: EventHandler
) {
  const lastCheckRef = useRef<string>(new Date().toISOString());

  useEffect(() => {
    const fetchUpdates = async () => {
      try {
        const res = await fetch(
          `/api/turnos/sync?since=${encodeURIComponent(lastCheckRef.current)}`
        );
        if (!res.ok) return;

        const data = await res.json();
        lastCheckRef.current = new Date().toISOString();

        if (data.creados?.length && onTurnoCreado) {
          data.creados.forEach((t: any) => onTurnoCreado(t));
        }
        if (data.editados?.length && onTurnoEditado) {
          data.editados.forEach((t: any) => onTurnoEditado(t));
        }
        if (data.eliminados?.length && onTurnoEliminado) {
          data.eliminados.forEach((t: TurnoEliminadoEvent) => onTurnoEliminado(t));
        }
      } catch {
        // silencioso — no interrumpir la UI
      }
    };

    // Primera llamada inmediata
    fetchUpdates();

    // Polling cada 30 segundos
    const interval = setInterval(fetchUpdates, 30_000);

    return () => clearInterval(interval);
  }, [onTurnoEliminado, onTurnoEditado, onTurnoCreado]);
}
