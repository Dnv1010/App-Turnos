import { NextRequest, NextResponse } from "next/server";
import { turnoEventEmitter, SSE_STREAM_MAX_MS } from "@/lib/turno-event-emitter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Por debajo del límite de Vercel (p. ej. 300s Pro); el stream se cierra solo antes en código. */
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const stream = new ReadableStream({
    start(controller) {
      turnoEventEmitter.addClient(controller);
      controller.enqueue('data: {"status":"connected"}\n\n');

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(": ping\n\n");
        } catch {
          clearInterval(heartbeat);
        }
      }, 20_000);

      const cleanup = () => {
        clearInterval(heartbeat);
        clearTimeout(closeTimer);
        turnoEventEmitter.removeClient(controller);
      };

      /** Cierra antes del timeout de Vercel; el cliente (EventSource) reconecta solo. */
      const closeTimer = setTimeout(() => {
        try {
          controller.enqueue('data: {"status":"reconnect"}\n\n');
          controller.close();
        } catch {
          /* ya cerrado */
        }
        cleanup();
      }, SSE_STREAM_MAX_MS);

      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
