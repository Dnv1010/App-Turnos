import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDay } from "date-fns";

function dateKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }
    const { userId, mes } = body;
    if (!userId || !mes) {
      return NextResponse.json({ error: "userId y mes (yyyy-MM) requeridos" }, { status: 400 });
    }

    if (session.user.role === "TECNICO" && userId !== session.user.userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (session.user.role === "COORDINADOR") {
      const target = await prisma.user.findUnique({ where: { id: userId }, select: { zona: true, role: true } });
      if (!target || target.role !== "TECNICO" || target.zona !== session.user.zona) {
        return NextResponse.json({ error: "Solo puedes precargar malla de técnicos de tu zona" }, { status: 403 });
      }
    }

    const [year, month] = String(mes).split("-").map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59));
    const festivos = await prisma.festivo.findMany({
      where: { fecha: { gte: start, lte: end } },
    });
    const festivoSet = new Set(festivos.map((f) => dateKey(f.fecha)));

    let count = 0;
    const current = new Date(start);
    while (current <= end) {
      const key = dateKey(current);
      const dayOfWeek = getDay(current);
      const isSunday = dayOfWeek === 0;
      const isSaturday = dayOfWeek === 6;
      const isFestivo = festivoSet.has(key);

      let tipo: "TRABAJO" | "DESCANSO" = "TRABAJO";
      let valor = "08:00-17:00";
      let horaInicio = "08:00";
      let horaFin = "17:00";

      if (isSunday || isFestivo) {
        tipo = "DESCANSO";
        valor = "descanso";
        horaInicio = "";
        horaFin = "";
      } else if (isSaturday) {
        valor = "08:00-12:00";
        horaInicio = "08:00";
        horaFin = "12:00";
      }

      await prisma.mallaTurno.upsert({
        where: { userId_fecha: { userId, fecha: new Date(current.getTime()) } },
        update: { valor, tipo, horaInicio: horaInicio || null, horaFin: horaFin || null },
        create: { userId, fecha: new Date(current.getTime()), valor, tipo, horaInicio: horaInicio || null, horaFin: horaFin || null },
      });
      count++;
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return NextResponse.json({ ok: true, registros: count });
  } catch (e) {
    console.error("[malla precarga]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error al precargar malla" }, { status: 500 });
  }
}
