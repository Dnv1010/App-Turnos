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
} from "@/lib/reportes-guardados-api";
import { valorDisponibilidadMallaPorRol } from "@/lib/reporteDisponibilidadValor";
import {
  whereDisponibilidadesMallaCombinadaParaReporte,
  whereForaneosDisponiblesParaReporte,
  whereTurnosCoordinadorDisponiblesParaReporte,
  whereTurnosDisponiblesParaReporte,
} from "@/lib/reportes-guardados";
import { rangoDateExpandidoUtc, turnoEnRangoFechaCalendario } from "@/lib/turnoRangoColombia";

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
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  const zona = searchParams.get("zona");

  if (!desde || !hasta) {
    return NextResponse.json({ error: "Parámetros desde y hasta requeridos" }, { status: 400 });
  }

  const rango = parseRangoFechasUtc(desde, hasta);
  if (!rango) {
    return NextResponse.json({ error: "Fechas inválidas" }, { status: 400 });
  }

  const { fechaInicio, fechaFin } = rango;
  // Rango expandido -1 día para capturar turnos que cruzaron medianoche
  // (ej: sábado 22:00 → domingo 06:00 — shift.date = sábado).
  const rangoExpandido = rangoDateExpandidoUtc(desde, hasta);
  const userIds = await getUserIdsTecnicosParaReporte(auth.profile, zona);
  const coordUserIds = await getUserIdsCoordinadoresParaReporte(auth.profile, zona);

  const whereDisp = whereDisponibilidadesMallaCombinadaParaReporte(
    fechaInicio,
    fechaFin,
    userIds,
    coordUserIds
  );

  const [turnosRaw, foraneos, disponibilidades, turnosCoordinadorRaw] = await Promise.all([
    userIds.length
      ? prisma.shift.findMany({
          where: whereTurnosDisponiblesParaReporte(rangoExpandido.gte, rangoExpandido.lte, userIds),
          include: { user: { select: { fullName: true, documentNumber: true, zone: true } } },
          orderBy: [{ date: "asc" }, { clockInAt: "asc" }],
        })
      : [],
    userIds.length
      ? prisma.tripRecord.findMany({
          where: whereForaneosDisponiblesParaReporte(fechaInicio, fechaFin, userIds),
          include: { user: { select: { fullName: true, documentNumber: true, zone: true } } },
          orderBy: { createdAt: "asc" },
        })
      : [],
    userIds.length || coordUserIds.length
      ? prisma.shiftSchedule.findMany({
          where: whereDisp,
          include: { user: { select: { fullName: true, documentNumber: true, zone: true, role: true } } },
          orderBy: [{ user: { fullName: "asc" } }, { date: "asc" }],
        })
      : [],
    coordUserIds.length
      ? prisma.shift.findMany({
          where: whereTurnosCoordinadorDisponiblesParaReporte(rangoExpandido.gte, rangoExpandido.lte, coordUserIds),
          include: { user: { select: { fullName: true, documentNumber: true, zone: true, role: true } } },
          orderBy: [{ date: "asc" }, { clockInAt: "asc" }],
        })
      : [],
  ]);

  // Filtrar por fecha Colombia: la query trajo -1 día para capturar turnos
  // que cruzaron medianoche; descartamos los que realmente no aplican al rango.
  const turnos = turnosRaw.filter((t) => turnoEnRangoFechaCalendario(t, desde, hasta));
  const turnosCoordinador = turnosCoordinadorRaw.filter((t) =>
    turnoEnRangoFechaCalendario(t, desde, hasta)
  );

  return NextResponse.json({
    turnos: turnos.map((t) => ({
      id: t.id,
      date: t.date.toISOString(),
      clockInAt: t.clockInAt.toISOString(),
      clockOutAt: t.clockOutAt?.toISOString() ?? null,
      daytimeOvertimeHours: t.daytimeOvertimeHours,
      nighttimeOvertimeHours: t.nighttimeOvertimeHours,
      sundayOvertimeHours: t.sundayOvertimeHours,
      nightSundayOvertimeHours: t.nightSundayOvertimeHours,
      nightSurchargeHours: t.nightSurchargeHours,
      sundaySurchargeHours: t.sundaySurchargeHours,
      nightSundaySurchargeHours: t.nightSundaySurchargeHours,
      regularHours: t.regularHours,
      user: t.user,
    })),
    foraneos: foraneos.map((f) => ({
      id: f.id,
      createdAt: f.createdAt.toISOString(),
      startKm: f.startKm,
      endKm: f.endKm,
      user: f.user,
    })),
    disponibilidades: disponibilidades.map((m) => ({
      id: m.id,
      date: m.date.toISOString(),
      shiftCode: m.shiftCode,
      amount: valorDisponibilidadMallaPorRol(m.user.role),
      user: m.user,
    })),
    turnosCoordinador: turnosCoordinador.map((t) => ({
      id: t.id,
      date: t.date.toISOString(),
      clockInAt: t.clockInAt.toISOString(),
      clockOutAt: t.clockOutAt?.toISOString() ?? null,
      orderCode: t.orderCode,
      daytimeOvertimeHours: t.daytimeOvertimeHours,
      nighttimeOvertimeHours: t.nighttimeOvertimeHours,
      sundayOvertimeHours: t.sundayOvertimeHours,
      nightSundayOvertimeHours: t.nightSundayOvertimeHours,
      nightSurchargeHours: t.nightSurchargeHours,
      sundaySurchargeHours: t.sundaySurchargeHours,
      nightSundaySurchargeHours: t.nightSundaySurchargeHours,
      regularHours: t.regularHours,
      user: t.user,
    })),
  });
}
