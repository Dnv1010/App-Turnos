export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getInicioSemana, getFinSemana } from "@/lib/bia/calc-engine";
import { getDay } from "date-fns";
import { nowColombia } from "@/lib/utils";
import { calcularHorasTurno, resultadoToTurnoData } from "@/lib/calcularHoras";

function dateKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userIdParam = searchParams.get("userId");
  const desde = searchParams.get("desde") ?? searchParams.get("inicio");
  const hasta = searchParams.get("hasta") ?? searchParams.get("fin");
  const zonaParam = searchParams.get("zona");
  console.log("[Turnos GET] desde:", desde, "hasta:", hasta);

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

  if (desde && hasta) {
    where.fecha = {
      gte: new Date(desde + "T00:00:00.000Z"),
      lte: new Date(hasta + "T23:59:59.999Z"),
    };
  }
  console.log("[Turnos GET] where:", JSON.stringify(where));

  const turnos = await prisma.turno.findMany({
    where,
    orderBy: [{ fecha: "desc" }, { horaEntrada: "desc" }],
    include: { user: { select: { nombre: true, zona: true } } },
  });
  console.log("[Turnos GET] total encontrados:", turnos.length);

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

  const ahoraUTC = new Date();
  const offsetColombia = -5 * 60; // UTC-5 en minutos
  const horaEntrada = new Date();
const fecha = new Date(Date.UTC(horaEntrada.getUTCFullYear(), horaEntrada.getUTCMonth(), horaEntrada.getUTCDate()));
  const turno = await prisma.turno.create({
    data: {
      userId: uid,
      fecha,
      horaEntrada,
      latEntrada: lat,
      lngEntrada: lng,
      startPhotoUrl: startPhotoUrl || null,
    },
  });

  return NextResponse.json(turno, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (session.user.role !== "TECNICO") {
      return NextResponse.json({ error: "Solo los técnicos pueden cerrar turnos" }, { status: 403 });
    }

    let body: { turnoId?: string; lat?: number; lng?: number; endPhotoUrl?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }
    const { turnoId, lat, lng, endPhotoUrl } = body;
    if (!turnoId) return NextResponse.json({ error: "turnoId requerido" }, { status: 400 });

    const turno = await prisma.turno.findUnique({ where: { id: turnoId } });
    if (!turno) return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });
    if (turno.userId !== session.user.userId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    if (turno.horaSalida) return NextResponse.json({ error: "Turno ya cerrado" }, { status: 400 });

    const ahoraUTC = new Date();
    const horaSalida = new Date(ahoraUTC.getTime() + (-5 * 60 * 60 * 1000));

    const [mallaDiaRow, festivosSemana] = await Promise.all([
      prisma.mallaTurno.findUnique({
        where: { userId_fecha: { userId: turno.userId, fecha: turno.fecha } },
      }),
      prisma.festivo.findMany({
        where: { fecha: { gte: getInicioSemana(turno.fecha), lte: getFinSemana(turno.fecha) } },
      }),
    ]);
    const holidaySet = new Set(festivosSemana.map((f) => dateKey(f.fecha)));
    const esFestivo = holidaySet.has(dateKey(turno.fecha));

    const mallaDia = mallaDiaRow
      ? {
          tipo: esFestivo ? "FESTIVO" : (mallaDiaRow.tipo ?? "TRABAJO"),
          horaInicio: mallaDiaRow.horaInicio,
          horaFin: mallaDiaRow.horaFin,
        }
      : esFestivo
        ? { tipo: "FESTIVO" as const, horaInicio: null, horaFin: null }
        : getDay(turno.fecha) === 0
          ? { tipo: "DESCANSO" as const, horaInicio: null, horaFin: null }
          : {
              tipo: "TRABAJO" as const,
              horaInicio: "08:00",
              horaFin: getDay(turno.fecha) === 6 ? "12:00" : "17:00",
            };

    const resultado = calcularHorasTurno(
      { horaEntrada: turno.horaEntrada, horaSalida },
      mallaDia
    );
    const resultadoDb = resultadoToTurnoData(resultado);

    const turnoActualizado = await prisma.turno.update({
      where: { id: turnoId },
      data: {
        horaSalida,
        latSalida: lat,
        lngSalida: lng,
        endPhotoUrl: endPhotoUrl || null,
        ...resultadoDb,
      },
    });

    return NextResponse.json(turnoActualizado);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error al cerrar turno";
    console.error("[PATCH /api/turnos]", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

