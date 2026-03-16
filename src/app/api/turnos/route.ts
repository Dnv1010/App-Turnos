import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { calcularTurno, calcularHorasSemanales, getInicioSemana, getFinSemana } from "@/lib/bia/calc-engine";
import { getDay } from "date-fns";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") || session.user.userId;
  const inicio = searchParams.get("inicio");
  const fin = searchParams.get("fin");

  const where: Record<string, unknown> = { userId };
  if (inicio && fin) {
    where.fecha = { gte: new Date(inicio), lte: new Date(fin) };
  }

  const turnos = await prisma.turno.findMany({
    where,
    orderBy: { fecha: "desc" },
    include: { user: { select: { nombre: true, zona: true } } },
  });

  return NextResponse.json(turnos);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { userId, lat, lng } = body;

  const turnoAbierto = await prisma.turno.findFirst({
    where: { userId, horaSalida: null },
  });

  if (turnoAbierto) {
    return NextResponse.json({ error: "Ya hay un turno abierto", turno: turnoAbierto }, { status: 400 });
  }

  const ahora = new Date();
  const turno = await prisma.turno.create({
    data: {
      userId,
      fecha: new Date(ahora.toISOString().split("T")[0]),
      horaEntrada: ahora,
      latEntrada: lat,
      lngEntrada: lng,
    },
  });

  return NextResponse.json(turno, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { turnoId, lat, lng } = body;

  const turno = await prisma.turno.findUnique({ where: { id: turnoId } });
  if (!turno) return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });
  if (turno.horaSalida) return NextResponse.json({ error: "Turno ya cerrado" }, { status: 400 });

  const horaSalida = new Date();

  const festivos = await prisma.festivo.findMany({ where: { fecha: turno.fecha } });
  const esFestivo = festivos.length > 0;
  const esDomingo = getDay(turno.fecha) === 0;

  const inicioSemana = getInicioSemana(turno.fecha);
  const finSemana = getFinSemana(turno.fecha);
  const turnosSemana = await prisma.turno.findMany({
    where: { userId: turno.userId, fecha: { gte: inicioSemana, lte: finSemana }, horaSalida: { not: null } },
  });

  const turnosData = turnosSemana.map((t) => ({
    fecha: t.fecha, horaEntrada: t.horaEntrada, horaSalida: t.horaSalida!,
    esFestivo: false, esDomingo: getDay(t.fecha) === 0,
  }));

  const resumenSemanal = calcularHorasSemanales(turnosData);
  const resultado = calcularTurno(
    { fecha: turno.fecha, horaEntrada: turno.horaEntrada, horaSalida, esFestivo, esDomingo },
    resumenSemanal
  );

  const turnoActualizado = await prisma.turno.update({
    where: { id: turnoId },
    data: { horaSalida, latSalida: lat, lngSalida: lng, ...resultado },
  });

  return NextResponse.json(turnoActualizado);
}
