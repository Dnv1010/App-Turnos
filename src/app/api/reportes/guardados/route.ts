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

  const reportesRaw = await prisma.report.findMany({
    where: whereListarReportes(auth.profile, zona),
    include: {
      createdByUser: { select: { fullName: true } },
      _count: {
        select: {
          shiftsIncluded: true,
          tripsIncluded: true,
          availabilitiesIncluded: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Contar turnos de coordinador por reporte en una sola query
  const reportIds = reportesRaw.map((r) => r.id);
  const coordCountsRaw = reportIds.length
    ? await prisma.$queryRaw<{ report_id: string; cnt: number }[]>`
        SELECT rs.report_id, COUNT(*)::int AS cnt
        FROM "App_turnos"."report_shifts" rs
        JOIN "App_turnos"."shifts" s ON s.id = rs.shift_id
        WHERE s.shift_type = 'COORDINATOR'
        AND rs.report_id = ANY(${reportIds})
        GROUP BY rs.report_id
      `
    : [];
  const coordCountMap = new Map(coordCountsRaw.map((r) => [r.report_id, r.cnt]));

  const reportes = reportesRaw.map((r) => ({
    id: r.id,
    name: r.name,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate.toISOString(),
    createdBy: r.createdBy,
    zone: r.zone,
    createdAt: r.createdAt.toISOString(),
    createdByUser: { fullName: r.createdByUser.fullName },
    _count: {
      turnosIncluidos: r._count.shiftsIncluded - (coordCountMap.get(r.id) ?? 0),
      foraneosIncluidos: r._count.tripsIncluded,
      disponibilidadesIncluidas: r._count.availabilitiesIncluded,
      turnosCoordinadorIncluidos: coordCountMap.get(r.id) ?? 0,
    },
  }));

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
    name?: string;
    startDate?: string;
    endDate?: string;
    zone?: string | null;
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

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "El name es obligatorio" }, { status: 400 });
  }

  const desde = body.startDate;
  const hasta = body.endDate;
  if (!desde || !hasta) {
    return NextResponse.json({ error: "startDate y endDate requeridos" }, { status: 400 });
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
    auth.profile.role === "COORDINADOR" ? null : body.zone === "ALL" ? null : body.zone ?? null;
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
    const ok = await prisma.shift.count({
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
    const okF = await prisma.tripRecord.count({
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
    const okM = await prisma.shiftSchedule.count({
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
    const okC = await prisma.shift.count({
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

  const zonaGuardar = zonaPersistidaParaCrear(auth.profile, body.zone ?? null);

  // Todos los shifts (técnicos + coordinadores) van en la misma relación shiftsIncluded
  const allShiftIds = [...turnoIds, ...turnoCoordinadorIds];

  try {
    const reporteRaw = await prisma.report.create({
      data: {
        name,
        startDate: fechaInicio,
        endDate: fechaFin,
        createdBy: auth.profile.id,
        zone: zonaGuardar,
        shiftsIncluded: {
          create: allShiftIds.map((shiftId) => ({ shiftId })),
        },
        tripsIncluded: {
          create: foraneoIds.map((tripRecordId) => ({ tripRecordId })),
        },
        availabilitiesIncluded: {
          create: disponibilidadIds.map((shiftScheduleId) => ({ shiftScheduleId })),
        },
      },
      include: {
        _count: {
          select: {
            shiftsIncluded: true,
            tripsIncluded: true,
            availabilitiesIncluded: true,
          },
        },
      },
    });

    const reporte = {
      id: reporteRaw.id,
      name: reporteRaw.name,
      startDate: reporteRaw.startDate.toISOString(),
      endDate: reporteRaw.endDate.toISOString(),
      createdBy: reporteRaw.createdBy,
      zone: reporteRaw.zone,
      createdAt: reporteRaw.createdAt.toISOString(),
      _count: {
        turnosIncluidos: turnoIds.length,
        foraneosIncluidos: reporteRaw._count.tripsIncluded,
        disponibilidadesIncluidas: reporteRaw._count.availabilitiesIncluded,
        turnosCoordinadorIncluidos: turnoCoordinadorIds.length,
      },
    };

    return NextResponse.json({ reporte });
  } catch (e) {
    console.error("[reportes/guardados POST]", e);
    return NextResponse.json({ error: "No se pudo guardar el reporte" }, { status: 500 });
  }
}
