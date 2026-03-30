export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { Zona } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/** Alineado con GET /api/turnos y reportes: solo turnos de técnicos visibles para el rol. */
async function buildTurnoUserScope(
  session: NonNullable<Awaited<ReturnType<typeof getServerSession>>>
): Promise<Prisma.TurnoWhereInput> {
  if (session.user.role === "PENDIENTE") {
    return { userId: { in: [] } };
  }
  if (session.user.role === "TECNICO") {
    return { userId: session.user.userId };
  }
  if (
    session.user.role === "COORDINADOR" ||
    session.user.role === "COORDINADOR_INTERIOR" ||
    session.user.role === "SUPPLY"
  ) {
    const usersZona = await prisma.user.findMany({
      where: {
        zona: session.user.zona as Zona,
        role: "TECNICO",
        isActive: true,
      },
      select: { id: true },
    });
    return { userId: { in: usersZona.map((u) => u.id) } };
  }
  if (session.user.role === "ADMIN" || session.user.role === "MANAGER") {
    const allT = await prisma.user.findMany({
      where: { role: "TECNICO", isActive: true },
      select: { id: true },
    });
    return { userId: { in: allT.map((u) => u.id) } };
  }
  return { userId: session.user.userId };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const sinceParam = searchParams.get("since");
    if (!sinceParam) return NextResponse.json({ creados: [], editados: [], eliminados: [] });

    const sinceDate = new Date(sinceParam);
    if (Number.isNaN(sinceDate.getTime())) {
      return NextResponse.json({ creados: [], editados: [], eliminados: [] });
    }

    const userScope = await buildTurnoUserScope(session);

    const turnos = await prisma.turno.findMany({
      where: {
        ...userScope,
        updatedAt: { gte: sinceDate },
        OR: [{ observaciones: null }, { observaciones: { not: { startsWith: "Cancelado" } } }],
      },
      include: { user: { select: { nombre: true, zona: true } } },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    const creados = turnos.filter(
      (t) => new Date(t.createdAt).getTime() >= sinceDate.getTime()
    );
    const editados = turnos.filter(
      (t) => new Date(t.createdAt).getTime() < sinceDate.getTime()
    );

    const cancelados = await prisma.turno.findMany({
      where: {
        ...userScope,
        updatedAt: { gte: sinceDate },
        observaciones: { startsWith: "Cancelado" },
      },
      select: { id: true, userId: true, updatedAt: true },
    });

    return NextResponse.json({
      creados,
      editados,
      eliminados: cancelados.map((t) => ({ id: t.id })),
    });
  } catch (e) {
    console.error("[sync]", e);
    return NextResponse.json({ creados: [], editados: [], eliminados: [] });
  }
}
