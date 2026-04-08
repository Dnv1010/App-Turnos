export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma, User } from "@prisma/client";
import type { Zona } from "@prisma/client";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";

/** Alineado con GET /api/turnos y reportes: solo turnos de técnicos visibles para el rol. */
async function buildTurnoUserScope(
  profile: User
): Promise<Prisma.TurnoWhereInput> {
  if (profile.role === "PENDIENTE") {
    return { userId: { in: [] } };
  }
  if (profile.role === "TECNICO") {
    return { userId: profile.id };
  }
  if (
    profile.role === "COORDINADOR" ||
    profile.role === "COORDINADOR_INTERIOR" ||
    profile.role === "SUPPLY"
  ) {
    const usersZona = await prisma.user.findMany({
      where: {
        zona: profile.zona as Zona,
        role: "TECNICO",
        isActive: true,
      },
      select: { id: true },
    });
    return { userId: { in: usersZona.map((u) => u.id) } };
  }
  if (profile.role === "ADMIN" || profile.role === "MANAGER") {
    const allT = await prisma.user.findMany({
      where: { role: "TECNICO", isActive: true },
      select: { id: true },
    });
    return { userId: { in: allT.map((u) => u.id) } };
  }
  return { userId: profile.id };
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const profile = await getUserProfile(user.email!);
    if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const sinceParam = searchParams.get("since");
    if (!sinceParam) return NextResponse.json({ creados: [], editados: [], eliminados: [] });

    const sinceDate = new Date(sinceParam);
    if (Number.isNaN(sinceDate.getTime())) {
      return NextResponse.json({ creados: [], editados: [], eliminados: [] });
    }

    const userScope = await buildTurnoUserScope(profile);

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
