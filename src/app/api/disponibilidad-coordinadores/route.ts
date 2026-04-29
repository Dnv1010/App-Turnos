export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { prisma } from "@/lib/prisma";
import { Role, Zone } from "@prisma/client";

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
      prisma.shiftSchedule.findMany({
        where: {
          userId: profile.id,
          date: { gte: fi, lte: ffEnd },
          dayType: "DISPONIBLE",
        },
        include: {
          user: { select: { fullName: true, documentNumber: true, zone: true, role: true } },
        },
        orderBy: { date: "asc" },
      }),
      prisma.availability.findMany({
        where: {
          userId: profile.id,
          date: { gte: fi, lte: ffEnd },
        },
        include: {
          user: { select: { fullName: true, documentNumber: true, zone: true, role: true } },
        },
        orderBy: { date: "asc" },
      }),
    ]);
    return NextResponse.json({
      coordinadores: [],
      disponibilidades,
      disponibilidadesTabla,
    });
  }

  if (!ROLES_OK.has(role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const whereUser: { isActive: boolean; role: { in: Role[] }; zone?: Zone } = {
    isActive: true,
    role: { in: [Role.COORDINADOR, Role.COORDINADOR_INTERIOR] },
  };
  if (zona && zona !== "ALL" && (zona === "BOGOTA" || zona === "COSTA" || zona === "INTERIOR")) {
    whereUser.zone = zona as Zone;
  }

  const [coordinadores, disponibilidades, disponibilidadesTabla] = await Promise.all([
    prisma.user.findMany({
      where: whereUser,
      select: { id: true, fullName: true, documentNumber: true, zone: true, role: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.shiftSchedule.findMany({
      where: {
        date: { gte: fi, lte: ffEnd },
        dayType: "DISPONIBLE",
        user: whereUser,
      },
      include: {
        user: { select: { fullName: true, documentNumber: true, zone: true, role: true } },
      },
      orderBy: [{ date: "asc" }, { user: { fullName: "asc" } }],
    }),
    prisma.availability.findMany({
      where: {
        date: { gte: fi, lte: ffEnd },
        user: whereUser,
      },
      include: {
        user: { select: { fullName: true, documentNumber: true, zone: true, role: true } },
      },
      orderBy: [{ date: "asc" }, { user: { fullName: "asc" } }],
    }),
  ]);

  return NextResponse.json({
    coordinadores,
    disponibilidades,
    disponibilidadesTabla,
  });
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

  let body: { userId?: string; dates?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  const dates = Array.isArray(body.dates) ? body.dates.filter(Boolean) : [];
  if (!userId || dates.length === 0) {
    return NextResponse.json({ error: "userId y dates[] requeridos" }, { status: 400 });
  }

  const targetUser = await prisma.user.findFirst({
    where: {
      id: userId,
      isActive: true,
      role: { in: [Role.COORDINADOR, Role.COORDINADOR_INTERIOR] },
    },
    select: { id: true, fullName: true, documentNumber: true },
  });
  if (!targetUser) {
    return NextResponse.json({ error: "Usuario no es líder de zona válido" }, { status: 400 });
  }

  for (const f of dates) {
    const fechaDate = parseYmdToUtcDate(f);
    if (!fechaDate) continue;

    await prisma.shiftSchedule.upsert({
      where: { userId_date: { userId, date: fechaDate } },
      create: {
        userId,
        date: fechaDate,
        dayType: "DISPONIBLE",
        shiftCode: "Disponible",
      },
      update: {
        dayType: "DISPONIBLE",
        shiftCode: "Disponible",
      },
    });
  }

  return NextResponse.json({ ok: true, asignados: dates.length });
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

  let body: { userId?: string; dates?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  const dates = Array.isArray(body.dates) ? body.dates.filter(Boolean) : [];
  if (!userId || dates.length === 0) {
    return NextResponse.json({ error: "userId y dates[] requeridos" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { documentNumber: true, fullName: true },
  });
  if (!targetUser) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  for (const f of dates) {
    const fechaDate = parseYmdToUtcDate(f);
    if (!fechaDate) continue;

    await prisma.shiftSchedule.deleteMany({
      where: {
        userId,
        date: fechaDate,
        dayType: "DISPONIBLE",
      },
    });
  }

  return NextResponse.json({ ok: true });
}
