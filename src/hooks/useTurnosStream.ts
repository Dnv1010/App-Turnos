import { useEffect } from "react";

interface TurnoEliminadoEvent {
  id: string;
  usuarioTecnico: string;
  fecha: string;
  zona: string;
  timestamp: string;
}

type EventHandler = (data: any) => void;

export function useTurnosStream(
  onTurnoEliminado?: EventHandler,
  onTurnoEditado?: EventHandler,
  onTurnoCreado?: EventHandler
) {
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 3000;

    const connect = () => {
      try {
        eventSource = new EventSource("/api/turnos/stream-sse");

        function parseSseData(raw: unknown): unknown {
          if (raw == null || raw === "") return null;
          const s = String(raw).trim();
          if (!s) return null;
          try {
            return JSON.parse(s);
          } catch {
            return null;
          }
        }

        eventSource.addEventListener("turno-eliminado", (event: Event) => {
          const customEvent = event as MessageEvent;
          const data = parseSseData(customEvent.data) as TurnoEliminadoEvent | null;
          if (!data) return;
          console.log("Turno eliminado en tiempo real:", data);
          onTurnoEliminado?.(data);
          reconnectAttempts = 0;
        });

        eventSource.addEventListener("turno-editado", (event: Event) => {
          const customEvent = event as MessageEvent;
          const data = parseSseData(customEvent.data);
          if (!data) return;
          console.log("Turno editado en tiempo real:", data);
          onTurnoEditado?.(data);
          reconnectAttempts = 0;
        });

        eventSource.addEventListener("turno-creado", (event: Event) => {
          const customEvent = event as MessageEvent;
          const data = parseSseData(customEvent.data);
          if (!data) return;
          console.log("Turno creado en tiempo real:", data);
          onTurnoCreado?.(data);
          reconnectAttempts = 0;
        });

        eventSource.onerror = () => {
          console.warn("Error en SSE, intentando reconectar...");
          eventSource?.close();
          eventSource = null;

          if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            const delay = reconnectDelay * reconnectAttempts;
            console.log(`Reconectando en ${delay}ms`);
            setTimeout(connect, delay);
          }
        };

        console.log("Conectado a SSE de turnos");
      } catch (error) {
        console.error("Error al conectar SSE:", error);
      }
    };

    connect();

    return () => {
      if (eventSource) {
        eventSource.close();
        console.log("SSE desconectado");
      }
    };
  }, [onTurnoEliminado, onTurnoEditado, onTurnoCreado]);
}
