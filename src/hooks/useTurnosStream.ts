import { useEffect, useRef } from "react";

type EventHandler = (data: any) => void;

export function useTurnosStream(
  onTurnoEliminado?: EventHandler,
  onTurnoEditado?: EventHandler,
  onTurnoCreado?: EventHandler
) {
  const lastCheckRef = useRef<string>(new Date().toISOString());

  // Refs para los callbacks — evitan que el efecto se reinicie en cada render
  const onEliminadoRef = useRef(onTurnoEliminado);
  const onEditadoRef = useRef(onTurnoEditado);
  const onCreadoRef = useRef(onTurnoCreado);

  useEffect(() => { onEliminadoRef.current = onTurnoEliminado; }, [onTurnoEliminado]);
  useEffect(() => { onEditadoRef.current = onTurnoEditado; }, [onTurnoEditado]);
  useEffect(() => { onCreadoRef.current = onTurnoCreado; }, [onTurnoCreado]);

  useEffect(() => {
    const fetchUpdates = async () => {
      try {
        const res = await fetch(
          `/api/turnos/sync?since=${encodeURIComponent(lastCheckRef.current)}`
        );
        if (!res.ok) return;

        const data = await res.json();
        lastCheckRef.current = new Date().toISOString();

        if (data.creados?.length && onCreadoRef.current) {
          data.creados.forEach((t: any) => onCreadoRef.current!(t));
        }
        if (data.editados?.length && onEditadoRef.current) {
          data.editados.forEach((t: any) => onEditadoRef.current!(t));
        }
        if (data.eliminados?.length && onEliminadoRef.current) {
          data.eliminados.forEach((t: any) => onEliminadoRef.current!(t));
        }
      } catch {
        // silencioso — no interrumpir la UI
      }
    };

    // Primera llamada inmediata
    fetchUpdates();

    // Polling cada 90 segundos
    const interval = setInterval(fetchUpdates, 90_000);

    return () => clearInterval(interval);
  }, []); // sin dependencias — el intervalo se crea una sola vez
}
