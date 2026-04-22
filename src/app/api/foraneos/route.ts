export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import type { EstadoAprobacion, Prisma, Zona } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const profile = await getUserProfile(user.email!);
    if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const desde = searchParams.get("desde");
    const hasta = searchParams.get("hasta");
    const userId = searchParams.get("userId");
    const estadoParam = searchParams.get("estado"); // PENDIENTE | APROBADA | NO_APROBADA | ALL

    if (!desde || !hasta) {
      return NextResponse.json({ error: "Parámetros desde y hasta requeridos" }, { status: 400 });
    }

    const [yi, mi, di] = desde.split("-").map(Number);
    const [yf, mf, df] = hasta.split("-").map(Number);
    const fechaInicio = new Date(Date.UTC(yi, mi - 1, di, 0, 0, 0));
    const fechaFin = new Date(Date.UTC(yf, mf - 1, df, 23, 59, 59));

    const whereUser: Prisma.UserWhereInput = { isActive: true, role: "TECNICO" };
    if (profile.role === "COORDINADOR") {
      whereUser.zona = profile.zona as Zona;
    } else if (profile.role === "TECNICO") {
      whereUser.id = profile.id;
    }
    if (userId && userId !== "ALL") whereUser.id = userId;

    const usuarios = await prisma.user.findMany({
      where: whereUser,
      select: { id: true },
    });
    const userIds = usuarios.map((u) => u.id);
    if (userIds.length === 0) return NextResponse.json([]);

    const estadoWhere: { estadoAprobacion?: EstadoAprobacion } = {};
    if (estadoParam === "PENDIENTE" || estadoParam === "APROBADA" || estadoParam === "NO_APROBADA") {
      estadoWhere.estadoAprobacion = estadoParam;
    }

    const fotos = await prisma.fotoRegistro.findMany({
      where: {
        tipo: "FORANEO",
        createdAt: { gte: fechaInicio, lte: fechaFin },
        userId: { in: userIds },
        ...estadoWhere,
      },
      include: { user: { select: { id: true, nombre: true, cedula: true, zona: true } } },
      orderBy: { createdAt: "desc" },
    });

    const lista = fotos.map((f) => ({
      id: f.id,
      nombre: f.user.nombre,
      cedula: f.user.cedula,
      zona: f.user.zona,
      fecha: f.createdAt.toISOString(),
      kmInicial: f.kmInicial,
      kmFinal: f.kmFinal,
      kmRecorridos:
        f.kmInicial != null && f.kmFinal != null ? Math.max(0, f.kmFinal - f.kmInicial) : null,
      driveUrl: f.driveUrl,
      driveUrlFinal: f.driveUrlFinal,
      latInicial: f.latInicial ?? null,
      lngInicial: f.lngInicial ?? null,
      latFinal: f.latFinal ?? null,
      lngFinal: f.lngFinal ?? null,
      observaciones: f.observaciones,
      estadoAprobacion: f.estadoAprobacion,
      aprobadoPor: f.aprobadoPor,
      fechaAprobacion: f.fechaAprobacion?.toISOString() ?? null,
      notaAprobacion: f.notaAprobacion,
    }));

    return NextResponse.json(lista);
  } catch (e) {
    console.error("[GET /api/foraneos]", e);
    return NextResponse.json({ error: "Error interno al obtener foráneos" }, { status: 500 });
  }
}
