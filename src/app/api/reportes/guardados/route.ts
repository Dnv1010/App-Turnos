export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { prisma } from "@/lib/prisma";
import {
  assertSesionReportesGuardados,
  getUserIdsCoordinadoresParaReporte,
  getUserIdsTecnicosParaReporte,
  parseRangoFechasUtc,
  whereListarReportes,
  zonaPersistidaParaCrear,
} from "@/lib/reportes-guardados-api";
import {
  whereDisponibilidadesMallaCombinadaParaReporte,
  whereForaneosDisponiblesParaReporte,
  whereTurnosCoordinadorDisponiblesParaReporte,
  whereTurnosDisponiblesParaReporte,
} from "@/lib/reportes-guardados";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const profile = await getUserProfile(user.email!);
  const auth = assertSesionReportesGuardados(profile);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const zona = searchParams.get("zona");

  const reportes = await prisma.reporte.findMany({
    where: whereListarReportes(auth.profile, zona),
    include: {
      creadoPorUser: { select: { nombre: true } },
      _count: {
        select: {
          turnosIncluidos: true,
          foraneosIncluidos: true,
          disponibilidadesIncluidas: true,
          turnosCoordinadorIncluidos: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ reportes });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const profile = await getUserProfile(user.email!);
  const auth = assertSesionReportesGuardados(profile);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    nombre?: string;
    fechaInicio?: string;
    fechaFin?: string;
    zona?: string | null;
    turnoIds?: string[];
    foraneoIds?: string[];
    disponibilidadIds?: string[];
    turnoCoordinadorIds?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const nombre = (body.nombre ?? "").trim();
  if (!nombre) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }

  const desde = body.fechaInicio;
  const hasta = body.fechaFin;
  if (!desde || !hasta) {
    return NextResponse.json({ error: "fechaInicio y fechaFin requeridos" }, { status: 400 });
  }

  const rango = parseRangoFechasUtc(desde, hasta);
  if (!rango) {
    return NextResponse.json({ error: "Fechas inválidas" }, { status: 400 });
  }

  const turnoIds = Array.isArray(body.turnoIds) ? [...new Set(body.turnoIds.filter(Boolean))] : [];
  const foraneoIds = Array.isArray(body.foraneoIds) ? [...new Set(body.foraneoIds.filter(Boolean))] : [];
  const disponibilidadIds = Array.isArray(body.disponibilidadIds)
    ? [...new Set(body.disponibilidadIds.filter(Boolean))]
    : [];
  const turnoCoordinadorIds = Array.isArray(body.turnoCoordinadorIds)
    ? [...new Set(body.turnoCoordinadorIds.filter(Boolean))]
    : [];

  if (
    turnoIds.length === 0 &&
    foraneoIds.length === 0 &&
    disponibilidadIds.length === 0 &&
    turnoCoordinadorIds.length === 0
  ) {
    return NextResponse.json({ error: "Debes incluir al menos un ítem en el reporte" }, { status: 400 });
  }

  const zonaParam =
    auth.profile.role === "COORDINADOR" ? null : body.zona === "ALL" ? null : body.zona ?? null;
  const userIds = await getUserIdsTecnicosParaReporte(auth.profile, zonaParam);
  const coordUserIds = await getUserIdsCoordinadoresParaReporte(auth.profile, zonaParam);

  if (
    userIds.length === 0 &&
    (turnoIds.length > 0 || foraneoIds.length > 0 || disponibilidadIds.length > 0)
  ) {
    return NextResponse.json({ error: "No hay operadores en el alcance para esos ítems" }, { status: 400 });
  }

  if (coordUserIds.length === 0 && turnoCoordinadorIds.length > 0) {
    return NextResponse.json(
      { error: "No hay líderes de zona en el alcance para esos turnos" },
      { status: 400 }
    );
  }

  const { fechaInicio, fechaFin } = rango;
  const whereTurnos = whereTurnosDisponiblesParaReporte(fechaInicio, fechaFin, userIds);
  const whereForaneos = whereForaneosDisponiblesParaReporte(fechaInicio, fechaFin, userIds);
  const whereMallaDisp = whereDisponibilidadesMallaCombinadaParaReporte(
    fechaInicio,
    fechaFin,
    userIds,
    coordUserIds
  );
  const whereTurnosCoord = whereTurnosCoordinadorDisponiblesParaReporte(
    fechaInicio,
    fechaFin,
    coordUserIds
  );

  if (turnoIds.length > 0) {
    const ok = await prisma.turno.count({
      where: { id: { in: turnoIds }, ...whereTurnos },
    });
    if (ok !== turnoIds.length) {
      return NextResponse.json(
        { error: "Algunos turnos no son válidos, ya fueron reportados o están fuera del rango" },
        { status: 400 }
      );
    }
  }

  if (foraneoIds.length > 0) {
    const okF = await prisma.fotoRegistro.count({
      where: { id: { in: foraneoIds }, ...whereForaneos },
    });
    if (okF !== foraneoIds.length) {
      return NextResponse.json(
        { error: "Algunos foráneos no son válidos, ya fueron reportados o están fuera del rango" },
        { status: 400 }
      );
    }
  }

  if (disponibilidadIds.length > 0) {
    const okM = await prisma.mallaTurno.count({
      where: { id: { in: disponibilidadIds }, ...whereMallaDisp },
    });
    if (okM !== disponibilidadIds.length) {
      return NextResponse.json(
        {
          error:
            "Algunas disponibilidades no son válidas, ya fueron reportadas o están fuera del rango",
        },
        { status: 400 }
      );
    }
  }

  if (turnoCoordinadorIds.length > 0) {
    const okC = await prisma.turnoCoordinador.count({
      where: { id: { in: turnoCoordinadorIds }, ...whereTurnosCoord },
    });
    if (okC !== turnoCoordinadorIds.length) {
      return NextResponse.json(
        {
          error:
            "Algunos turnos de coordinador no son válidos, ya fueron reportados o están fuera del rango",
        },
        { status: 400 }
      );
    }
  }

  const zonaGuardar = zonaPersistidaParaCrear(auth.profile, body.zona ?? null);

  try {
    const reporte = await prisma.reporte.create({
      data: {
        nombre,
        fechaInicio,
        fechaFin,
        creadoPor: auth.profile.id,
        zona: zonaGuardar,
        turnosIncluidos: {
          create: turnoIds.map((turnoId) => ({ turnoId })),
        },
        foraneosIncluidos: {
          create: foraneoIds.map((fotoRegistroId) => ({ fotoRegistroId })),
        },
        disponibilidadesIncluidas: {
          create: disponibilidadIds.map((mallaTurnoId) => ({ mallaTurnoId })),
        },
        turnosCoordinadorIncluidos: {
          create: turnoCoordinadorIds.map((turnoCoordinadorId) => ({ turnoCoordinadorId })),
        },
      },
      include: {
        _count: {
          select: {
            turnosIncluidos: true,
            foraneosIncluidos: true,
            disponibilidadesIncluidas: true,
            turnosCoordinadorIncluidos: true,
          },
        },
      },
    });

    return NextResponse.json({ reporte });
  } catch (e) {
    console.error("[reportes/guardados POST]", e);
    return NextResponse.json({ error: "No se pudo guardar el reporte" }, { status: 500 });
  }
}
