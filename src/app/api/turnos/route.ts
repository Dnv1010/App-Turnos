import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { calcularTurno, calcularHorasSemanales, calcularHorasSemanalesConMalla, getInicioSemana, getFinSemana } from "@/lib/bia/calc-engine";
import { getDay } from "date-fns";
import { nowColombia } from "@/lib/utils";

function dateKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userIdParam = searchParams.get("userId");
  const inicio = searchParams.get("inicio");
  const fin = searchParams.get("fin");
  const zonaParam = searchParams.get("zona");

  let where: Record<string, unknown> = {};

  if (session.user.role === "TECNICO") {
    where.userId = session.user.userId;
  } else if (session.user.role === "COORDINADOR") {
    const zona = zonaParam || session.user.zona;
    const usersZona = await prisma.user.findMany({
      where: { zona, role: "TECNICO", isActive: true },
      select: { id: true },
    });
    where.userId = { in: usersZona.map((u) => u.id) };
  } else if (userIdParam) {
    where.userId = userIdParam;
  } else {
    where.userId = session.user.userId;
  }

  if (inicio && fin) {
    where.fecha = { gte: new Date(inicio), lte: new Date(fin) };
  }

  const turnos = await prisma.turno.findMany({
    where,
    orderBy: [{ fecha: "desc" }, { horaEntrada: "desc" }],
    include: { user: { select: { nombre: true, zona: true } } },
  });

  return NextResponse.json(turnos);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "TECNICO") {
    return NextResponse.json({ error: "Solo los técnicos pueden iniciar turnos" }, { status: 403 });
  }

  const body = await req.json();
  const { userId, lat, lng, startPhotoUrl } = body;
  const uid = userId || session.user.userId;

  const turnoAbierto = await prisma.turno.findFirst({
    where: { userId: uid, horaSalida: null },
  });

  if (turnoAbierto) {
    return NextResponse.json({ error: "Ya hay un turno abierto", turno: turnoAbierto }, { status: 400 });
  }

  const ahora = nowColombia();
  const turno = await prisma.turno.create({
    data: {
      userId: uid,
      fecha: new Date(ahora.toISOString().split("T")[0]),
      horaEntrada: ahora,
      latEntrada: lat,
      lngEntrada: lng,
      startPhotoUrl: startPhotoUrl || null,
    },
  });

  return NextResponse.json(turno, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "TECNICO") {
    return NextResponse.json({ error: "Solo los técnicos pueden cerrar turnos" }, { status: 403 });
  }

  const body = await req.json();
  const { turnoId, lat, lng, endPhotoUrl } = body;

  const turno = await prisma.turno.findUnique({ where: { id: turnoId } });
  if (!turno) return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });
  if (turno.userId !== session.user.userId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (turno.horaSalida) return NextResponse.json({ error: "Turno ya cerrado" }, { status: 400 });

  const horaSalida = nowColombia();

  const inicioSemana = getInicioSemana(turno.fecha);
  const finSemana = getFinSemana(turno.fecha);

  const [mallaSemana, festivosSemana] = await Promise.all([
    prisma.mallaTurno.findMany({
      where: { userId: turno.userId, fecha: { gte: inicioSemana, lte: finSemana } },
    }),
    prisma.festivo.findMany({ where: { fecha: { gte: inicioSemana, lte: finSemana } } }),
  ]);
  const mallaMap = new Map<string, string>();
  mallaSemana.forEach((m) => mallaMap.set(dateKey(m.fecha), m.valor));
  const holidaySet = new Set(festivosSemana.map((f) => dateKey(f.fecha)));

  const esFestivo = holidaySet.has(dateKey(turno.fecha));
  const esDomingo = getDay(turno.fecha) === 0;

  const turnosSemana = await prisma.turno.findMany({
    where: { userId: turno.userId, fecha: { gte: inicioSemana, lte: finSemana }, horaSalida: { not: null } },
  });
  const turnosData = turnosSemana.map((t) => ({
    fecha: t.fecha, horaEntrada: t.horaEntrada, horaSalida: t.horaSalida!,
    esFestivo: holidaySet.has(dateKey(t.fecha)), esDomingo: getDay(t.fecha) === 0,
  }));
  turnosData.push({
    fecha: turno.fecha, horaEntrada: turno.horaEntrada, horaSalida,
    esFestivo, esDomingo: getDay(turno.fecha) === 0,
  });

  const mallaGetter = (fecha: Date) => mallaMap.get(dateKey(fecha)) ?? null;
  const resumenSemanal = calcularHorasSemanalesConMalla(turnosData, mallaGetter, holidaySet);
  const mallaVal = mallaMap.get(dateKey(turno.fecha)) ?? null;
  const resultado = calcularTurno(
    { fecha: turno.fecha, horaEntrada: turno.horaEntrada, horaSalida, esFestivo, esDomingo },
    resumenSemanal,
    mallaVal,
    holidaySet
  );

  const turnoActualizado = await prisma.turno.update({
    where: { id: turnoId },
    data: { horaSalida, latSalida: lat, lngSalida: lng, endPhotoUrl: endPhotoUrl || null, ...resultado },
  });

  return NextResponse.json(turnoActualizado);
}
