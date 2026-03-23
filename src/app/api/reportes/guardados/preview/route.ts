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
  const userIds = await getUserIdsTecnicosParaReporte(auth.session, zona);
  const coordUserIds = await getUserIdsCoordinadoresParaReporte(auth.session, zona);

  const [turnos, foraneos, disponibilidades, turnosCoordinador] = await Promise.all([
    userIds.length
      ? prisma.turno.findMany({
          where: whereTurnosDisponiblesParaReporte(fechaInicio, fechaFin, userIds),
          include: { user: { select: { nombre: true, cedula: true, zona: true } } },
          orderBy: [{ fecha: "asc" }, { horaEntrada: "asc" }],
        })
      : [],
    userIds.length
      ? prisma.fotoRegistro.findMany({
          where: whereForaneosDisponiblesParaReporte(fechaInicio, fechaFin, userIds),
          include: { user: { select: { nombre: true, cedula: true, zona: true } } },
          orderBy: { createdAt: "asc" },
        })
      : [],
    userIds.length
      ? prisma.mallaTurno.findMany({
          where: whereDisponibilidadesMallaParaReporte(fechaInicio, fechaFin, userIds),
          include: { user: { select: { nombre: true, cedula: true, zona: true } } },
          orderBy: [{ user: { nombre: "asc" } }, { fecha: "asc" }],
        })
      : [],
    coordUserIds.length
      ? prisma.turnoCoordinador.findMany({
          where: whereTurnosCoordinadorDisponiblesParaReporte(fechaInicio, fechaFin, coordUserIds),
          include: { user: { select: { nombre: true, cedula: true, zona: true, role: true } } },
          orderBy: [{ fecha: "asc" }, { horaEntrada: "asc" }],
        })
      : [],
  ]);

  return NextResponse.json({
    turnos: turnos.map((t) => ({
      id: t.id,
      fecha: t.fecha.toISOString(),
      horaEntrada: t.horaEntrada.toISOString(),
      horaSalida: t.horaSalida?.toISOString() ?? null,
      heDiurna: t.heDiurna,
      heNocturna: t.heNocturna,
      heDominical: t.heDominical,
      heNoctDominical: t.heNoctDominical,
      recNocturno: t.recNocturno,
      recDominical: t.recDominical,
      recNoctDominical: t.recNoctDominical,
      horasOrdinarias: t.horasOrdinarias,
      user: t.user,
    })),
    foraneos: foraneos.map((f) => ({
      id: f.id,
      createdAt: f.createdAt.toISOString(),
      kmInicial: f.kmInicial,
      kmFinal: f.kmFinal,
      user: f.user,
    })),
    disponibilidades: disponibilidades.map((m) => ({
      id: m.id,
      fecha: m.fecha.toISOString(),
      valor: m.valor,
      user: m.user,
    })),
    turnosCoordinador: turnosCoordinador.map((t) => ({
      id: t.id,
      fecha: t.fecha.toISOString(),
      horaEntrada: t.horaEntrada.toISOString(),
      horaSalida: t.horaSalida?.toISOString() ?? null,
      codigoOrden: t.codigoOrden,
      heDiurna: t.heDiurna,
      heNocturna: t.heNocturna,
      heDominical: t.heDominical,
      heNoctDominical: t.heNoctDominical,
      recNocturno: t.recNocturno,
      recDominical: t.recDominical,
      recNoctDominical: t.recNoctDominical,
      horasOrdinarias: t.horasOrdinarias,
      user: t.user,
    })),
  });
}
