export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";

const connectedClients = new Set<ReadableStreamDefaultController>();

export const turnoEventEmitter = {
  emit(event: string, data: any) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    connectedClients.forEach((controller) => {
      try {
        controller.enqueue(message);
      } catch (error) {
        connectedClients.delete(controller);
      }
    });
  },
};

export async function GET(req: NextRequest) {
  const stream = new ReadableStream({
    start(controller) {
      connectedClients.add(controller);
      controller.enqueue('data: {"status":"connected"}\n\n');
      const cleanup = () => {
        connectedClients.delete(controller);
      };
      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}