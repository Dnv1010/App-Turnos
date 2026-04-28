import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { prisma } from "@/lib/prisma";
import { JobTitle } from "@prisma/client";
import { turnoEventEmitter } from "@/lib/turno-event-emitter";
import { calcularHorasTurno, resultadoToTurnoData } from "@/lib/calcularHoras";
import { sumWeeklyOrdHoursMonSat } from "@/lib/weeklyOrdHours";
import { startOfWeek, endOfWeek } from "date-fns";
import { dateKeyColombia, getDayOfWeekColombia } from "@/lib/bia/calc-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";


const DIAS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
function getDiaSemana(fecha: Date): string {
  return DIAS_ES[fecha.getUTCDay()];
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const profile = await getUserProfile(user.email!);
    if (!profile) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    if (
      profile.role !== "COORDINADOR" &&
      profile.role !== "ADMIN" &&
      profile.role !== "SUPPLY"
    ) {
      return NextResponse.json({ error: "Solo coordinadores y admins pueden editar turnos" }, { status: 403 });
    }

    const turnoId = params.id;
    let body: { clockInAt?: string; clockOutAt?: string | null; notes?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }
    const { clockInAt, clockOutAt, notes } = body;

    if (!clockInAt || typeof clockInAt !== "string") {
      return NextResponse.json({ error: "clockInAt requerida" }, { status: 400 });
    }

    const turnoExistente = await prisma.shift.findUnique({
      where: { id: turnoId },
      include: { user: { select: { id: true, zone: true, role: true, jobTitle: true } } },
    });
    if (!turnoExistente) {
      return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });
    }

    if (profile.role === "SUPPLY") {
      const u = turnoExistente.user;
      if (
        u.role !== "TECNICO" ||
        u.zone !== profile.zone ||
        u.jobTitle !== JobTitle.ALMACENISTA
      ) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
    }

    // Convertir hora Colombia (sin tz) a UTC sumando 5h
    const newEntrada = new Date(new Date(clockInAt).getTime() + 5 * 60 * 60 * 1000);
    const newSalida =
      clockOutAt != null && clockOutAt !== ""
        ? new Date(new Date(clockOutAt).getTime() + 5 * 60 * 60 * 1000)
        : null;

    // Fecha Colombia desde la entrada
    const colombiaDate = new Date(newEntrada.getTime() - 5 * 60 * 60 * 1000);
    const fecha = new Date(
      Date.UTC(colombiaDate.getUTCFullYear(), colombiaDate.getUTCMonth(), colombiaDate.getUTCDate())
    );

    const weekStart = startOfWeek(fecha, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(fecha, { weekStartsOn: 1 });

    const [mallaDiaRow, festivosSemana, turnosSemana] = await Promise.all([
      prisma.shiftSchedule.findUnique({
        where: { userId_date: { userId: turnoExistente.userId, date: fecha } },
      }),
      prisma.holiday.findMany({
        where: { date: { gte: weekStart, lte: weekEnd } },
      }),
      prisma.shift.findMany({
        where: {
          userId: turnoExistente.userId,
          date: { gte: weekStart, lte: weekEnd },
          id: { not: turnoId },
          clockOutAt: { not: null },
        },
        select: { date: true, regularHours: true },
      }),
    ]);

    const holidaySet = new Set(festivosSemana.map((f) => dateKeyColombia(f.date)));
    const esFestivo = holidaySet.has(dateKeyColombia(fecha));
    const weeklyOrdHours = sumWeeklyOrdHoursMonSat(
      turnosSemana.map((t) => ({ fecha: t.date, horasOrdinarias: t.regularHours ?? 0 }))
    );

    type MallaRow = { tipo?: string | null; valor: string; horaInicio?: string | null; horaFin?: string | null };
    const row = mallaDiaRow
      ? ({
          tipo: mallaDiaRow.dayType,
          valor: mallaDiaRow.shiftCode,
          horaInicio: mallaDiaRow.startTime,
          horaFin: mallaDiaRow.endTime,
        } as MallaRow)
      : null;
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

    const editorLabel = profile.fullName ?? profile.role;
    const fechaEdicion = new Date().toISOString().split("T")[0];
    const notaFinal = notes
      ? `${notes} [Editado ${fechaEdicion} por ${editorLabel}]`
      : `[Editado ${fechaEdicion} por ${editorLabel}]`;

    const turnoActualizado = await prisma.shift.update({
      where: { id: turnoId },
      data: {
        date: fecha,
        weekday: getDiaSemana(fecha),
        clockInAt: newEntrada,
        clockOutAt: newSalida,
        notes: notaFinal,
        regularHours: horasData.horasOrdinarias,
        daytimeOvertimeHours: horasData.heDiurna,
        nighttimeOvertimeHours: horasData.heNocturna,
        sundayOvertimeHours: horasData.heDominical,
        nightSundayOvertimeHours: horasData.heNoctDominical,
        nightSurchargeHours: horasData.recNocturno,
        sundaySurchargeHours: horasData.recDominical,
        nightSundaySurchargeHours: horasData.recNoctDominical,
      },
      include: { user: { select: { fullName: true, zone: true } } },
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
      zona: turnoExistente.user.zone,
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

/** Mismo cuerpo que PATCH (algunos despliegues/proxies devuelven 405 con PATCH en rutas dinámicas). */
export async function PUT(
  req: NextRequest,
  context: { params: { id: string } }
) {
  return PATCH(req, context);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const profile = await getUserProfile(user.email!);
    if (!profile) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    if (
      profile.role !== "COORDINADOR" &&
      profile.role !== "ADMIN" &&
      profile.role !== "SUPPLY"
    ) {
      return NextResponse.json(
        { error: "Solo coordinadores y admins pueden eliminar turnos" },
        { status: 403 }
      );
    }

    const turnoId = params.id;

    const turnoAnterior = await prisma.shift.findUnique({
      where: { id: turnoId },
      include: { user: { select: { zone: true, role: true, jobTitle: true } } },
    });

    if (!turnoAnterior) {
      return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });
    }

    if (profile.role === "SUPPLY") {
      const u = turnoAnterior.user;
      if (
        u.role !== "TECNICO" ||
        u.zone !== profile.zone ||
        u.jobTitle !== JobTitle.ALMACENISTA
      ) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
    }

    await prisma.shift.delete({
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
      fecha: turnoAnterior.date.toISOString().split("T")[0],
      zona: turnoAnterior.user.zone,
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
