export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
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
  whereDisponibilidadesMallaParaReporte,
  whereForaneosDisponiblesParaReporte,
  whereTurnosCoordinadorDisponiblesParaReporte,
  whereTurnosDisponiblesParaReporte,
} from "@/lib/reportes-guardados";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const auth = assertSesionReportesGuardados(session);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const zona = searchParams.get("zona");

  const reportes = await prisma.reporte.findMany({
    where: whereListarReportes(auth.session, zona),
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
  const session = await getServerSession(authOptions);
  const auth = assertSesionReportesGuardados(session);
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
    auth.session.user.role === "COORDINADOR" ? null : body.zona === "ALL" ? null : body.zona ?? null;
  const userIds = await getUserIdsTecnicosParaReporte(auth.session, zonaParam);
  const coordUserIds = await getUserIdsCoordinadoresParaReporte(auth.session, zonaParam);

  if (
    userIds.length === 0 &&
    (turnoIds.length > 0 || foraneoIds.length > 0 || disponibilidadIds.length > 0)
  ) {
    return NextResponse.json({ error: "No hay técnicos en el alcance para esos ítems" }, { status: 400 });
  }

  if (coordUserIds.length === 0 && turnoCoordinadorIds.length > 0) {
    return NextResponse.json(
      { error: "No hay coordinadores en el alcance para esos turnos" },
      { status: 400 }
    );
  }

  const { fechaInicio, fechaFin } = rango;
  const whereTurnos = whereTurnosDisponiblesParaReporte(fechaInicio, fechaFin, userIds);
  const whereForaneos = whereForaneosDisponiblesParaReporte(fechaInicio, fechaFin, userIds);
  const whereMallaDisp = whereDisponibilidadesMallaParaReporte(fechaInicio, fechaFin, userIds);
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

  const zonaGuardar = zonaPersistidaParaCrear(auth.session, body.zona ?? null);

  try {
    const reporte = await prisma.reporte.create({
      data: {
        nombre,
        fechaInicio,
        fechaFin,
        creadoPor: auth.session.user.userId,
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
