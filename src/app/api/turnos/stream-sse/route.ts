export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 1;

import { NextResponse } from "next/server";

export async function GET() {
  return new NextResponse(
    'data: {"status":"deprecated","redirect":"/api/turnos/sync"}\n\n',
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    }
  );
}
