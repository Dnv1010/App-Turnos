/**
 * Bus de eventos en memoria para SSE de turnos.
 * En Vercel serverless cada instancia tiene su propio Set: los clientes solo reciben
 * eventos si el mismo worker atiende la petición que emite (limitación conocida).
 */
const connectedClients = new Set<ReadableStreamDefaultController<Uint8Array>>();

export const turnoEventEmitter = {
  addClient(controller: ReadableStreamDefaultController) {
    connectedClients.add(controller);
  },
  removeClient(controller: ReadableStreamDefaultController) {
    connectedClients.delete(controller);
  },
  emit(event: string, data: unknown) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    connectedClients.forEach((controller) => {
      try {
        controller.enqueue(message);
      } catch {
        connectedClients.delete(controller);
      }
    });
  },
};

/** Cierra el stream SSE de forma ordenada antes del timeout de Vercel (evita "Task timed out"). */
export const SSE_STREAM_MAX_MS = 1_000;
