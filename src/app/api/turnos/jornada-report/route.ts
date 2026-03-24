export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (session.user.role !== "TECNICO") {
      return NextResponse.json({ error: "Solo operadores" }, { status: 403 });
    }

    let body: { turnoId?: string; ordenTrabajo?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    const { turnoId, ordenTrabajo } = body;
    const ot = (ordenTrabajo ?? "").trim();
    if (!turnoId || !ot) {
      return NextResponse.json({ error: "turnoId y ordenTrabajo requeridos" }, { status: 400 });
    }

    const turno = await prisma.turno.findUnique({ where: { id: turnoId } });
    if (!turno) return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });
    if (turno.userId !== session.user.userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (turno.horaSalida) {
      return NextResponse.json({ error: "El turno ya está cerrado" }, { status: 400 });
    }

    const colombia = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });
    const linea = `[${colombia}] Jornada extendida: sigue laborando — Orden de trabajo: ${ot}`;

    const prev = turno.observaciones?.trim() ?? "";
    const observaciones = prev ? `${prev}\n${linea}` : linea;

    await prisma.turno.update({
      where: { id: turnoId },
      data: { observaciones },
    });

    try {
      const origin = new URL(req.url).origin;
      const cookie = req.headers.get("cookie") ?? "";
      await fetch(`${origin}/api/sheets/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      });
    } catch (err) {
      console.error("Sheets sync tras jornada-report:", err);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/turnos/jornada-report]", e);
    return NextResponse.json({ error: "Error al guardar" }, { status: 500 });
  }
}
