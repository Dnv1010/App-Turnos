export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { prisma } from "@/lib/prisma";
import { Role, Zona } from "@prisma/client";
import {
  appendDisponibilidadCoordinadorSheet,
  deleteDisponibilidadCoordinadorSheet,
} from "@/lib/sheetsDisponibilidadCoordinador";

const ROLES_OK = new Set<string>(["MANAGER", "ADMIN"]);

// FIX: guardar a 00:00 UTC (medianoche) igual que todos los @db.Date de la app
// Antes era 12:00 UTC lo que causaba que date-fns en el browser mostrara el día anterior
function parseYmdToUtcDate(ymd: string): Date | null {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const profile = await getUserProfile(user.email!);
  if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  const zona = searchParams.get("zona");

  if (!desde || !hasta) {
    return NextResponse.json({ error: "desde y hasta requeridos (YYYY-MM-DD)" }, { status: 400 });
  }

  const fi = parseYmdToUtcDate(desde);
  const ff = parseYmdToUtcDate(hasta);
  if (!fi || !ff) return NextResponse.json({ error: "Fechas inválidas" }, { status: 400 });

  // Para el rango fin, cubrir todo el día
  const ffEnd = new Date(ff.getTime() + 23 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59 * 1000);

  const role = profile.role;

  if (role === "COORDINADOR" || role === "COORDINADOR_INTERIOR") {
    const [disponibilidades, disponibilidadesTabla] = await Promise.all([
      prisma.mallaTurno.findMany({
        where: {
          userId: profile.id,
          fecha: { gte: fi, lte: ffEnd },
          tipo: "DISPONIBLE",
        },
        include: {
          user: { select: { nombre: true, cedula: true, zona: true, role: true } },
        },
        orderBy: { fecha: "asc" },
      }),
      prisma.disponibilidad.findMany({
        where: {
          userId: profile.id,
          fecha: { gte: fi, lte: ffEnd },
        },
        include: {
          user: { select: { nombre: true, cedula: true, zona: true, role: true } },
        },
        orderBy: { fecha: "asc" },
      }),
    ]);
    return NextResponse.json({ coordinadores: [], disponibilidades, disponibilidadesTabla });
  }

  if (!ROLES_OK.has(role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const whereUser: { isActive: boolean; role: { in: Role[] }; zona?: Zona } = {
    isActive: true,
    role: { in: [Role.COORDINADOR, Role.COORDINADOR_INTERIOR] },
  };
  if (zona && zona !== "ALL" && (zona === "BOGOTA" || zona === "COSTA" || zona === "INTERIOR")) {
    whereUser.zona = zona as Zona;
  }

  const [coordinadores, disponibilidades, disponibilidadesTabla] = await Promise.all([
    prisma.user.findMany({
      where: whereUser,
      select: { id: true, nombre: true, cedula: true, zona: true, role: true },
      orderBy: { nombre: "asc" },
    }),
    prisma.mallaTurno.findMany({
      where: {
        fecha: { gte: fi, lte: ffEnd },
        tipo: "DISPONIBLE",
        user: whereUser,
      },
      include: {
        user: { select: { nombre: true, cedula: true, zona: true, role: true } },
      },
      orderBy: [{ fecha: "asc" }, { user: { nombre: "asc" } }],
    }),
    prisma.disponibilidad.findMany({
      where: {
        fecha: { gte: fi, lte: ffEnd },
        user: whereUser,
      },
      include: {
        user: { select: { nombre: true, cedula: true, zona: true, role: true } },
      },
      orderBy: [{ fecha: "asc" }, { user: { nombre: "asc" } }],
    }),
  ]);

  return NextResponse.json({ coordinadores, disponibilidades, disponibilidadesTabla });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const profile = await getUserProfile(user.email!);
  if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  if (!ROLES_OK.has(profile.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let body: { userId?: string; fechas?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  const fechas = Array.isArray(body.fechas) ? body.fechas.filter(Boolean) : [];
  if (!userId || fechas.length === 0) {
    return NextResponse.json({ error: "userId y fechas[] requeridos" }, { status: 400 });
  }

  const targetUser = await prisma.user.findFirst({
    where: {
      id: userId,
      isActive: true,
      role: { in: [Role.COORDINADOR, Role.COORDINADOR_INTERIOR] },
    },
    select: { id: true, nombre: true, cedula: true },
  });
  if (!targetUser) {
    return NextResponse.json({ error: "Usuario no es líder de zona válido" }, { status: 400 });
  }

  for (const f of fechas) {
    const fechaDate = parseYmdToUtcDate(f);
    if (!fechaDate) continue;

    await prisma.mallaTurno.upsert({
      where: { userId_fecha: { userId, fecha: fechaDate } },
      create: {
        userId,
        fecha: fechaDate,
        tipo: "DISPONIBLE",
        valor: "Disponible",
      },
      update: {
        tipo: "DISPONIBLE",
        valor: "Disponible",
      },
    });

    void deleteDisponibilidadCoordinadorSheet(targetUser.cedula ?? "", f);
    void appendDisponibilidadCoordinadorSheet(targetUser.cedula ?? "", targetUser.nombre, f);
  }

  return NextResponse.json({ ok: true, asignados: fechas.length });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const profile = await getUserProfile(user.email!);
  if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  if (!ROLES_OK.has(profile.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let body: { userId?: string; fechas?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  const fechas = Array.isArray(body.fechas) ? body.fechas.filter(Boolean) : [];
  if (!userId || fechas.length === 0) {
    return NextResponse.json({ error: "userId y fechas[] requeridos" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { cedula: true, nombre: true },
  });
  if (!targetUser) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  for (const f of fechas) {
    const fechaDate = parseYmdToUtcDate(f);
    if (!fechaDate) continue;

    await prisma.mallaTurno.deleteMany({
      where: {
        userId,
        fecha: fechaDate,
        tipo: "DISPONIBLE",
      },
    });

    void deleteDisponibilidadCoordinadorSheet(targetUser.cedula ?? "", f);
  }

  return NextResponse.json({ ok: true });
}