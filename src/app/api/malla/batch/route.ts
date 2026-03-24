import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = await req.json();
    const { userIds, fechas, valor } = body;

    if (!Array.isArray(userIds) || !Array.isArray(fechas) || userIds.length === 0 || fechas.length === 0) {
      return NextResponse.json({ error: "userIds y fechas (arrays no vacíos) requeridos" }, { status: 400 });
    }

    if (session.user.role === "TECNICO") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (session.user.role === "COORDINADOR" || session.user.role === "SUPPLY") {
      const targets = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, zona: true, role: true, cargo: true },
      });
      const invalid = targets.some((t) => {
        if (t.role !== "TECNICO" || t.zona !== session.user.zona) return true;
        if (session.user.role === "SUPPLY" && t.cargo !== "ALMACENISTA") return true;
        return false;
      });
      if (invalid || targets.length !== userIds.length) {
        return NextResponse.json({ error: "Solo puedes asignar malla a operadores de tu zona" }, { status: 403 });
      }
    }

    let count = 0;
    for (const userId of userIds) {
      for (const fecha of fechas) {
        const fechaStr = typeof fecha === "string" ? fecha : String(fecha);
        const [y, m, d] = fechaStr.split("-").map(Number);
        if (!y || !m || !d) continue;
        const fechaDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

        await prisma.mallaTurno.upsert({
          where: { userId_fecha: { userId, fecha: fechaDate } },
          update: { valor: valor ?? "" },
          create: { userId, fecha: fechaDate, valor: valor ?? "" },
        });
        count++;
      }
    }

    return NextResponse.json({ ok: true, registros: count });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
