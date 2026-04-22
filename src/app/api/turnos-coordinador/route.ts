export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { prisma } from "@/lib/prisma";
import { Zona } from "@prisma/client";

const ROLES_FICHAJE = new Set<string>(["COORDINADOR", "COORDINADOR_INTERIOR"]);
const ROLES_VER_TODOS = new Set<string>(["MANAGER", "ADMIN"]);

function parseFechas(desde: string, hasta: string) {
  const [yi, mi, di] = desde.split("-").map(Number);
  const [yf, mf, df] = hasta.split("-").map(Number);
  if (!yi || !mi || !di || !yf || !mf || !df) return null;
  return {
    gte: new Date(Date.UTC(yi, mi - 1, di)),
    lte: new Date(Date.UTC(yf, mf - 1, df)),
  };
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const profile = await getUserProfile(user.email!);
  if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const role = profile.role;
  if (!ROLES_FICHAJE.has(role) && !ROLES_VER_TODOS.has(role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  const userIdParam = searchParams.get("userId");
  const zona = searchParams.get("zona");

  const where: Record<string, unknown> = {};

  if (ROLES_FICHAJE.has(role)) {
    where.userId = profile.id;
  } else if (ROLES_VER_TODOS.has(role)) {
    if (userIdParam) where.userId = userIdParam;
    if (zona && zona !== "ALL") {
      where.user = { zona: zona as Zona };
    }
  }

  if (desde && hasta) {
    const rango = parseFechas(desde, hasta);
    if (rango) where.fecha = rango;
  }

  const turnos = await prisma.turnoCoordinador.findMany({
    where,
    include: {
      user: { select: { nombre: true, cedula: true, zona: true, role: true } },
    },
    orderBy: [{ fecha: "desc" }, { horaEntrada: "desc" }],
  });

  return NextResponse.json({ turnos });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const profile = await getUserProfile(user.email!);
  if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  if (!ROLES_FICHAJE.has(profile.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let body: { codigoOrden?: string; lat?: number; lng?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const codigoOrden = (body.codigoOrden ?? "").trim();
  if (!codigoOrden) {
    return NextResponse.json({ error: "codigoOrden es obligatorio" }, { status: 400 });
  }

  const turnoAbierto = await prisma.turnoCoordinador.findFirst({
    where: { userId: profile.id, horaSalida: null },
  });
  if (turnoAbierto) {
    return NextResponse.json({ error: "Ya tienes un turno abierto" }, { status: 400 });
  }

  const horaEntrada = new Date();
  const ahoraColombia = new Date(horaEntrada.getTime() - 5 * 60 * 60 * 1000);
  const fecha = new Date(
    Date.UTC(ahoraColombia.getUTCFullYear(), ahoraColombia.getUTCMonth(), ahoraColombia.getUTCDate())
  );

  const turno = await prisma.turnoCoordinador.create({
    data: {
      userId: profile.id,
      fecha,
      horaEntrada,
      codigoOrden,
      latEntrada: body.lat ?? null,
      lngEntrada: body.lng ?? null,
    },
    include: {
      user: { select: { nombre: true, cedula: true, zona: true, role: true } },
    },
  });

  return NextResponse.json({ turno }, { status: 201 });
}
