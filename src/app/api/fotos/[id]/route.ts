export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { getInicioSemana, getFinSemana, getDayOfWeekColombia } from "@/lib/bia/calc-engine";
import { calcularHorasTurno, resultadoToTurnoData } from "@/lib/calcularHoras";
import { sumWeeklyOrdHoursMonSat } from "@/lib/weeklyOrdHours";
import { uploadToStorage } from "@/lib/supabase-storage";

function dateKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

async function checkCoordinadorZona(turnoUserId: string, userProfile: { zone?: string | null; role: string }) {
  if (userProfile.role !== "COORDINADOR") return true;
  const user = await prisma.user.findUnique({
    where: { id: turnoUserId },
    select: { zone: true, role: true },
  });
  return user?.role === "TECNICO" && user?.zone === userProfile.zone;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const profile = await getUserProfile(user.email!);
  if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const { id } = await params;
  const turno = await prisma.shift.findUnique({
    where: { id },
    include: { user: { select: { documentNumber: true, fullName: true, email: true, zone: true } } },
  });
  if (!turno) return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });

  const canAccess = profile.role === "ADMIN" || profile.role === "MANAGER" ||
    (profile.role === "COORDINADOR" && await checkCoordinadorZona(turno.userId, profile)) ||
    (profile.role === "TECNICO" && turno.userId === profile.id);
  if (!canAccess) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  return NextResponse.json({ ok: true, turno });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const profile = await getUserProfile(user.email!);
    if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    const { id } = await params;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }

    // ——— FotoRegistro (foráneo: finalizar con foto + km, o editar km/obs) ———
    const fotoRec = await prisma.tripRecord.findUnique({ where: { id } });
    if (fotoRec) {
      if (profile.role !== "TECNICO" || fotoRec.userId !== profile.id) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }

      const base64Data = body.base64Data as string | undefined;
      const hasFinalize = base64Data != null && base64Data !== "" && body.endKm != null && body.endKm !== "";

      if (hasFinalize) {
        if (fotoRec.type !== "FORANEO" || fotoRec.endKm != null) {
          return NextResponse.json({ error: "Foráneo ya finalizado o no es un registro foráneo activo" }, { status: 400 });
        }
        const kmFinalNum = parseFloat(String(body.endKm));
        if (Number.isNaN(kmFinalNum) || fotoRec.startKm == null || kmFinalNum <= fotoRec.startKm) {
          return NextResponse.json({ error: "Km final inválido" }, { status: 400 });
        }

        const endLatRaw = body.endLat;
        const endLngRaw = body.endLng;
        const latN = endLatRaw != null ? parseFloat(String(endLatRaw)) : NaN;
        const lngN = endLngRaw != null ? parseFloat(String(endLngRaw)) : NaN;
        if (Number.isNaN(latN) || Number.isNaN(lngN)) {
          return NextResponse.json(
            { error: "Ubicación GPS requerida para finalizar el foráneo (latitud y longitud válidas)." },
            { status: 400 }
          );
        }

        let fileIdFinal: string | null = null;
        let fileUrlFinal: string | null = null;
        try {
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const fileName = `foraneo_fin_${fotoRec.userId}_${timestamp}.jpg`;
          const result = await uploadToStorage(base64Data, fileName, "fotos-foraneos");
          fileIdFinal = result.fileId;
          fileUrlFinal = result.webViewLink;
        } catch (e) {
          console.error("[PATCH /api/fotos/[id]] Error subiendo foto final a Storage:", e);
          return NextResponse.json({ error: "No se pudo subir la foto final a Storage" }, { status: 500 });
        }

        const actualizado = await prisma.tripRecord.update({
          where: { id },
          data: {
            endKm: kmFinalNum,
            driveFileIdFinal: fileIdFinal,  // Mantener nombre de campo
            driveUrlFinal: fileUrlFinal,    // Mantener nombre de campo
            endLat: latN,
            endLng: lngN,
          },
        });
        return NextResponse.json({ ok: true, registro: actualizado });
      }

      const data: {
        startKm?: number | null;
        endKm?: number | null;
        notes?: string | null;
      } = {};
      if ("startKm" in body) {
        data.startKm =
          body.startKm != null && body.startKm !== ""
            ? parseFloat(String(body.startKm))
            : null;
      }
      if ("endKm" in body) {
        data.endKm =
          body.endKm != null && body.endKm !== "" ? parseFloat(String(body.endKm)) : null;
      }
      if ("notes" in body) {
        data.notes = (body.notes as string) || null;
      }
      if (Object.keys(data).length === 0) {
        return NextResponse.json({ error: "Sin campos para actualizar" }, { status: 400 });
      }

      const actualizado = await prisma.tripRecord.update({
        where: { id },
        data,
      });
      return NextResponse.json({ ok: true, registro: actualizado });
    }

    // ——— Turno (coordinador / admin / manager) ———
    const turno = await prisma.shift.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!turno) return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });

    const canEdit = profile.role === "ADMIN" || profile.role === "MANAGER" ||
      (profile.role === "COORDINADOR" && await checkCoordinadorZona(turno.userId, profile));
    if (!canEdit) return NextResponse.json({ error: "Solo coordinador o superior puede editar este turno" }, { status: 403 });

    if (turno.notes?.startsWith("Cancelado")) {
      return NextResponse.json({ error: "No se puede editar un turno cancelado" }, { status: 400 });
    }

    const horaEntradaISO = body.clockInAt as string | undefined;
    const horaSalidaISO = body.clockOutAt as string | undefined;
    const notesBody = body.notes as string | undefined;

    const newEntrada = horaEntradaISO ? new Date(horaEntradaISO) : turno.clockInAt;
    const newSalida = horaSalidaISO ? new Date(horaSalidaISO) : turno.clockOutAt;

    // Calcular fecha en Colombia (UTC-5)
    const ahoraColombia = new Date(newEntrada.getTime() - 5 * 60 * 60 * 1000);
    const fecha = new Date(Date.UTC(
      ahoraColombia.getUTCFullYear(),
      ahoraColombia.getUTCMonth(),
      ahoraColombia.getUTCDate()
    ));

    if (!newSalida) {
      await prisma.shift.update({
        where: { id },
        data: {
          clockInAt: newEntrada,
          date: fecha,
          notes: notesBody ? `${notesBody} [Editado ${new Date().toISOString()}]` : turno.notes,
        },
      });
      return NextResponse.json({ ok: true, msg: "Hora de inicio actualizada" });
    }

    const inicioSemana = getInicioSemana(fecha);
    const finSemana = getFinSemana(fecha);

    const [mallaDiaRow, festivosSemana, turnosSemana] = await Promise.all([
      prisma.shiftSchedule.findUnique({
        where: { userId_date: { userId: turno.userId, date: fecha } },
      }),
      prisma.holiday.findMany({
        where: { date: { gte: inicioSemana, lte: finSemana } },
      }),
      prisma.shift.findMany({
        where: {
          userId: turno.userId,
          date: { gte: inicioSemana, lte: finSemana },
          clockOutAt: { not: null },
          id: { not: id },
          OR: [
            { notes: null },
            { notes: { not: { startsWith: "Cancelado" } } },
          ],
        },
        select: { date: true, regularHours: true },
      }),
    ]);

    const holidaySet = new Set(festivosSemana.map((f) => dateKey(f.date)));
    const esFestivo = holidaySet.has(dateKey(fecha));
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
    const mallaDia = row
      ? {
          tipo: esFestivo ? "FESTIVO" : (row.tipo ?? "TRABAJO"),
          valor: row.valor ?? null,
          horaInicio: row.horaInicio,
          horaFin: row.horaFin,
        }
      : esFestivo
        ? { tipo: "FESTIVO" as const, valor: null, horaInicio: null, horaFin: null }
        : getDayOfWeekColombia(fecha) === 0
          ? { tipo: "DESCANSO" as const, valor: null, horaInicio: null, horaFin: null }
          : {
              tipo: "TRABAJO" as const,
              valor: "Trabajo",
              horaInicio: "08:00",
              horaFin: getDayOfWeekColombia(fecha) === 6 ? "12:00" : "17:00",
            };

    const resultado = calcularHorasTurno(
      { horaEntrada: newEntrada, horaSalida: newSalida, fecha },
      mallaDia,
      holidaySet,
      weeklyOrdHours
    );
    const resultadoDb = resultadoToTurnoData(resultado);

    await prisma.shift.update({
      where: { id },
      data: {
        date: fecha,
        clockInAt: newEntrada,
        clockOutAt: newSalida,
        notes: notesBody ? `${notesBody} [Editado ${new Date().toISOString()}]` : turno.notes,
        regularHours: resultadoDb.horasOrdinarias,
        daytimeOvertimeHours: resultadoDb.heDiurna,
        nighttimeOvertimeHours: resultadoDb.heNocturna,
        sundayOvertimeHours: resultadoDb.heDominical,
        nightSundayOvertimeHours: resultadoDb.heNoctDominical,
        nightSurchargeHours: resultadoDb.recNocturno,
        sundaySurchargeHours: resultadoDb.recDominical,
        nightSundaySurchargeHours: resultadoDb.recNoctDominical,
      },
    });

    return NextResponse.json({
      ok: true,
      msg: `Turno actualizado. Ord: ${resultadoDb.horasOrdinarias}h, HE: ${resultadoDb.heDiurna + resultadoDb.heNocturna}h`,
      turno: {
        regularHours: resultadoDb.horasOrdinarias,
        daytimeOvertimeHours: resultadoDb.heDiurna,
        nighttimeOvertimeHours: resultadoDb.heNocturna,
        sundayOvertimeHours: resultadoDb.heDominical,
        nightSundayOvertimeHours: resultadoDb.heNoctDominical,
        nightSurchargeHours: resultadoDb.recNocturno,
        sundaySurchargeHours: resultadoDb.recDominical,
        nightSundaySurchargeHours: resultadoDb.recNoctDominical,
        date: dateKey(fecha),
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error al editar";
    console.error("[PATCH /api/fotos/[id]]", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const profile = await getUserProfile(user.email!);
  if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const { id } = await params;
  const turno = await prisma.shift.findUnique({ where: { id } });
  if (!turno) return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });

  const canDelete = profile.role === "ADMIN" || profile.role === "MANAGER" ||
    (profile.role === "COORDINADOR" && await checkCoordinadorZona(turno.userId, profile));
  if (!canDelete) return NextResponse.json({ error: "No autorizado para cancelar este turno" }, { status: 403 });

  await prisma.shift.update({
    where: { id },
    data: {
      notes: `Cancelado por coordinador ${new Date().toISOString()}`,
    },
  });
  return NextResponse.json({ ok: true, msg: "Turno cancelado" });
}
