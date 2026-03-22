import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { turnoEventEmitter } from "../stream-sse/route";
import { calcularHorasTurno, resultadoToTurnoData } from "@/lib/calcularHoras";
import { startOfWeek, endOfWeek } from "date-fns";
import { dateKeyColombia } from "@/lib/bia/calc-engine";

function getDayOfWeekColombia(d: Date): number {
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return colombia.getUTCDay();
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.user.role !== "COORDINADOR" && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo coordinadores y admins pueden editar turnos" }, { status: 403 });
    }

    const turnoId = params.id;
    let body: { horaEntrada?: string; horaSalida?: string | null; observaciones?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }
    const { horaEntrada, horaSalida, observaciones } = body;

    if (!horaEntrada || typeof horaEntrada !== "string") {
      return NextResponse.json({ error: "horaEntrada requerida" }, { status: 400 });
    }

    const turnoExistente = await prisma.turno.findUnique({
      where: { id: turnoId },
      include: { user: { select: { id: true, zona: true } } },
    });
    if (!turnoExistente) {
      return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });
    }

    // Convertir hora Colombia (sin tz) a UTC sumando 5h
    const newEntrada = new Date(new Date(horaEntrada).getTime() + 5 * 60 * 60 * 1000);
    const newSalida =
      horaSalida != null && horaSalida !== ""
        ? new Date(new Date(horaSalida).getTime() + 5 * 60 * 60 * 1000)
        : null;

    // Fecha Colombia desde la entrada
    const colombiaDate = new Date(newEntrada.getTime() - 5 * 60 * 60 * 1000);
    const fecha = new Date(
      Date.UTC(colombiaDate.getUTCFullYear(), colombiaDate.getUTCMonth(), colombiaDate.getUTCDate())
    );

    const weekStart = startOfWeek(fecha, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(fecha, { weekStartsOn: 1 });

    const [mallaDiaRow, festivosSemana, turnosSemana] = await Promise.all([
      prisma.mallaTurno.findUnique({
        where: { userId_fecha: { userId: turnoExistente.userId, fecha } },
      }),
      prisma.festivo.findMany({
        where: { fecha: { gte: weekStart, lte: weekEnd } },
      }),
      prisma.turno.findMany({
        where: {
          userId: turnoExistente.userId,
          fecha: { gte: weekStart, lte: weekEnd },
          id: { not: turnoId },
          horaSalida: { not: null },
        },
        select: { horasOrdinarias: true },
      }),
    ]);

    const holidaySet = new Set(festivosSemana.map((f) => dateKeyColombia(f.fecha)));
    const esFestivo = holidaySet.has(dateKeyColombia(fecha));
    const weeklyOrdHours = turnosSemana.reduce((s, t) => s + (t.horasOrdinarias ?? 0), 0);

    type MallaRow = { tipo?: string | null; valor: string; horaInicio?: string | null; horaFin?: string | null };
    const row = mallaDiaRow as MallaRow | null;
    const dowColombia = getDayOfWeekColombia(fecha);

    const mallaDia = row
      ? {
          tipo: esFestivo ? "FESTIVO" : (row.tipo ?? "TRABAJO"),
          valor: row.valor ?? null,
          horaInicio: row.horaInicio,
          horaFin: row.horaFin,
        }
      : esFestivo
        ? { tipo: "FESTIVO" as const, valor: null, horaInicio: null, horaFin: null }
        : dowColombia === 0
          ? { tipo: "DESCANSO" as const, valor: null, horaInicio: null, horaFin: null }
          : {
              tipo: "TRABAJO" as const,
              valor: "Trabajo",
              horaInicio: "08:00",
              horaFin: dowColombia === 6 ? "12:00" : "17:00",
            };

    let horasData = {
      horasOrdinarias: 0,
      heDiurna: 0,
      heNocturna: 0,
      heDominical: 0,
      heNoctDominical: 0,
      recNocturno: 0,
      recDominical: 0,
      recNoctDominical: 0,
    };

    if (newSalida) {
      const resultado = calcularHorasTurno(
        { horaEntrada: newEntrada, horaSalida: newSalida, fecha },
        mallaDia,
        holidaySet,
        weeklyOrdHours
      );
      horasData = resultadoToTurnoData(resultado);
    }

    const editorLabel = session.user.nombre ?? session.user.role;
    const fechaEdicion = new Date().toISOString().split("T")[0];
    const notaFinal = observaciones
      ? `${observaciones} [Editado ${fechaEdicion} por ${editorLabel}]`
      : `[Editado ${fechaEdicion} por ${editorLabel}]`;

    const turnoActualizado = await prisma.turno.update({
      where: { id: turnoId },
      data: {
        fecha,
        horaEntrada: newEntrada,
        horaSalida: newSalida,
        observaciones: notaFinal,
        ...horasData,
      },
      include: { user: { select: { nombre: true, zona: true } } },
    });

    try {
      const origin = new URL(req.url).origin;
      const cookie = req.headers.get("cookie") ?? "";
      await fetch(`${origin}/api/sheets/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
      });
    } catch (sheetErr) {
      console.error("Error sincronizando Sheets tras editar turno:", sheetErr);
    }

    turnoEventEmitter.emit("turno-editado", {
      id: turnoId,
      usuarioTecnico: turnoExistente.userId,
      fecha: fecha.toISOString().split("T")[0],
      zona: turnoExistente.user.zona,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      turno: turnoActualizado,
    });
  } catch (error) {
    console.error("Error al editar turno:", error);
    return NextResponse.json(
      { error: "Error al editar turno", details: error instanceof Error ? error.message : "" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    if (session.user.role !== "COORDINADOR" && session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Solo coordinadores y admins pueden eliminar turnos" },
        { status: 403 }
      );
    }

    const turnoId = params.id;

    const turnoAnterior = await prisma.turno.findUnique({
      where: { id: turnoId },
      include: { user: { select: { zona: true } } },
    });

    if (!turnoAnterior) {
      return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });
    }

    await prisma.turno.delete({
      where: { id: turnoId },
    });

    console.log("Turno eliminado:", turnoId);

    try {
      const origin = new URL(req.url).origin;
      const cookie = req.headers.get("cookie") ?? "";
      await fetch(`${origin}/api/sheets/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
      });
    } catch (sheetErr) {
      console.error("Error sincronizando Sheets tras eliminar turno:", sheetErr);
    }

    turnoEventEmitter.emit("turno-eliminado", {
      id: turnoId,
      usuarioTecnico: turnoAnterior.userId,
      fecha: turnoAnterior.fecha.toISOString().split("T")[0],
      zona: turnoAnterior.user.zona,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: "Turno eliminado exitosamente",
      id: turnoId,
    });
  } catch (error) {
    console.error("Error al eliminar turno:", error);
    return NextResponse.json(
      { error: "Error al eliminar turno", details: error instanceof Error ? error.message : "" },
      { status: 500 }
    );
  }
}
