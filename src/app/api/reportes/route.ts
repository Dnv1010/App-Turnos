export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { calcularTurno, getInicioSemana, checkMallaAlerts, dateKeyColombia } from "@/lib/bia/calc-engine";
import { sumWeeklyOrdHoursMonSat } from "@/lib/weeklyOrdHours";
import { valorDisponibilidadMallaPorRol } from "@/lib/reporteDisponibilidadValor";

/**
 * FIX: Día de la semana para fechas @db.Date (midnight UTC = día de calendario).
 * Las fechas @db.Date llegan como midnight UTC — NO restar offset de Colombia
 * porque 2026-04-06T00:00:00Z - 5h = 2026-04-05T19:00Z = domingo (incorrecto).
 * Si tiene hora distinta de midnight (horaEntrada/horaSalida) sí aplicar offset.
 */
function getDayOfWeekColombia(d: Date): number {
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    return d.getUTCDay();
  }
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return colombia.getUTCDay();
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const profile = await getUserProfile(user.email!);
  if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const inicio = searchParams.get("inicio");
  const fin = searchParams.get("fin");
  const zona = searchParams.get("zona");
  const userId = searchParams.get("userId");
  const rol = searchParams.get("rol");

  if (!inicio || !fin) {
    return NextResponse.json({ error: "Parametros inicio y fin requeridos" }, { status: 400 });
  }

  const whereUser: Record<string, unknown> = { isActive: true };
  if (userId) whereUser.id = userId;
  if (rol && rol !== "ALL") whereUser.role = rol;
  if (
    profile.role === "COORDINADOR" ||
    profile.role === "MANAGER" ||
    profile.role === "ADMIN" ||
    profile.role === "SUPPLY"
  ) {
    whereUser.role = "TECNICO";
  }
  if (profile.role === "COORDINADOR") {
    whereUser.zone = profile.zone;
  } else if (profile.role === "SUPPLY") {
    if (zona && zona !== "ALL") whereUser.zone = zona;
  } else if (profile.role === "TECNICO") {
    whereUser.id = profile.id;
  } else if (zona && zona !== "ALL") {
    whereUser.zone = zona;
  }

  const [yi, mi, di] = inicio.split("-").map(Number);
  const [yf, mf, df] = fin.split("-").map(Number);
  const fechaInicio = new Date(Date.UTC(yi!, mi! - 1, di!, 0, 0, 0));
  const fechaFin = new Date(Date.UTC(yf!, mf! - 1, df!, 23, 59, 59));

  const usuarios = await prisma.user.findMany({
    where: whereUser,
    select: {
      id: true, fullName: true, documentNumber: true, email: true, zone: true, role: true,
      shifts: {
        where: {
          date: { gte: fechaInicio, lte: fechaFin },
          clockOutAt: { not: null },
          OR: [
            { notes: null },
            { notes: { not: { startsWith: "Cancelado" } } },
          ],
        },
        orderBy: { date: "asc" },
      },
      shiftSchedules: {
        where: {
          date: { gte: fechaInicio, lte: fechaFin },
          dayType: "DISPONIBLE",
        },
      },
      tripRecords: {
        where: {
          createdAt: { gte: fechaInicio, lte: fechaFin },
          OR: [{ type: { not: "FORANEO" } }, { type: "FORANEO", approvalStatus: "APROBADA" }],
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const userIds = usuarios.map((u) => u.id);
  const mallaDB = await prisma.shiftSchedule.findMany({
    where: {
      userId: { in: userIds },
      date: { gte: fechaInicio, lte: fechaFin },
    },
  });
  const mallaMap = new Map<string, string>();
  for (const m of mallaDB) {
    mallaMap.set(`${m.userId}|${dateKeyColombia(m.date)}`, m.shiftCode);
  }

  const festivos = await prisma.holiday.findMany({
    where: { date: { gte: fechaInicio, lte: fechaFin } },
  });
  const holidaySet = new Set(festivos.map((f) => dateKeyColombia(f.date)));

  const alertasMalla: Array<{ userId: string; fullName: string; mensaje: string; tipo?: string }> = [];

  const detalle = usuarios.map((user) => {
    const mallaGetter = (fecha: Date) => mallaMap.get(`${user.id}|${dateKeyColombia(fecha)}`) ?? null;

    // Pre-agrupar por semana para evitar O(n²): filter dentro de map
    const turnosPorSemana = new Map<number, typeof user.shifts>();
    for (const t of user.shifts) {
      const key = getInicioSemana(t.date).getTime();
      if (!turnosPorSemana.has(key)) turnosPorSemana.set(key, []);
      turnosPorSemana.get(key)!.push(t);
    }

    const turnosConMalla = user.shifts.map((t) => {
      const mallaVal = mallaGetter(t.date);
      const inicioSemana = getInicioSemana(t.date);
      const turnosSemana = turnosPorSemana.get(inicioSemana.getTime()) ?? [];
      const weeklyOrdParaRegla44 = sumWeeklyOrdHoursMonSat(
        turnosSemana.map((x) => ({
          id: x.id,
          fecha: x.date,
          horasOrdinarias: x.regularHours,
        })),
        t.id
      );
      const resumenSemanal = {
        horasOrdinariasSemana: Math.round(weeklyOrdParaRegla44 * 100) / 100,
        aplicaRegla44h: weeklyOrdParaRegla44 < 44,
      };
      const totalHoras = (t.clockOutAt!.getTime() - t.clockInAt.getTime()) / (1000 * 60 * 60);
      const resultado = calcularTurno(
        {
          fecha: t.date,
          horaEntrada: t.clockInAt,
          horaSalida: t.clockOutAt!,
          esFestivo: holidaySet.has(dateKeyColombia(t.date)),
          // FIX: usar getDayOfWeekColombia corregida que respeta midnight UTC
          esDomingo: getDayOfWeekColombia(t.date) === 0,
        },
        resumenSemanal,
        mallaVal,
        holidaySet
      );
      const alerts = checkMallaAlerts(t.id, user.email ?? "", user.fullName, t.date, mallaVal, holidaySet.has(dateKeyColombia(t.date)), totalHoras);
      alerts.forEach((a) => alertasMalla.push({ userId: user.id, fullName: user.fullName, mensaje: a.detalle, tipo: a.tipo }));

      return {
        ...t,
        ...resultado,
        date: t.date,
        clockInAt: t.clockInAt,
        clockOutAt: t.clockOutAt,
        regularHours: Math.max(0, resultado.horasOrdinarias ?? 0),
        daytimeOvertimeHours: resultado.heDiurna,
        nighttimeOvertimeHours: resultado.heNocturna,
        sundayOvertimeHours: resultado.heDominical,
        nightSundayOvertimeHours: resultado.heNoctDominical,
        nightSurchargeHours: resultado.recNocturno,
        sundaySurchargeHours: resultado.recDominical,
        nightSundaySurchargeHours: resultado.recNoctDominical,
        malla: mallaVal ?? undefined,
      };
    });

    const totalHE = turnosConMalla.reduce((sum, t) => sum + t.daytimeOvertimeHours + t.nighttimeOvertimeHours + t.sundayOvertimeHours + t.nightSundayOvertimeHours, 0);
    const totalRecargos = turnosConMalla.reduce((sum, t) => sum + t.nightSurchargeHours + t.sundaySurchargeHours + t.nightSundaySurchargeHours, 0);
    const totalOrdinarias = turnosConMalla.reduce((sum, t) => sum + Math.max(0, t.regularHours ?? 0), 0);
    const totalDisponibilidades = user.shiftSchedules.reduce(
      (sum) => sum + valorDisponibilidadMallaPorRol(user.role), 0
    );

    const fotosForaneo = user.tripRecords.filter((f) => f.type === "FORANEO");
    const totalKmRecorridos = fotosForaneo.reduce((sum, f) => {
      if (f.startKm != null && f.endKm != null && f.endKm > f.startKm) {
        return sum + (f.endKm - f.startKm);
      }
      return sum;
    }, 0);

    const totalHorasTrabajadas = turnosConMalla.reduce((sum, t) => {
      if (t.clockOutAt) {
        return sum + (new Date(t.clockOutAt).getTime() - new Date(t.clockInAt).getTime()) / (1000 * 60 * 60);
      }
      return sum;
    }, 0);

    return {
      userId: user.id, fullName: user.fullName, documentNumber: user.documentNumber, email: user.email, zone: user.zone, role: user.role,
      totalTurnos: turnosConMalla.length,
      regularHours: Math.max(0, Math.round(totalOrdinarias * 100) / 100),
      daytimeOvertimeHours: Math.round(turnosConMalla.reduce((s, t) => s + t.daytimeOvertimeHours, 0) * 100) / 100,
      nighttimeOvertimeHours: Math.round(turnosConMalla.reduce((s, t) => s + t.nighttimeOvertimeHours, 0) * 100) / 100,
      sundayOvertimeHours: Math.round(turnosConMalla.reduce((s, t) => s + t.sundayOvertimeHours, 0) * 100) / 100,
      nightSundayOvertimeHours: Math.round(turnosConMalla.reduce((s, t) => s + t.nightSundayOvertimeHours, 0) * 100) / 100,
      nightSurchargeHours: Math.round(turnosConMalla.reduce((s, t) => s + t.nightSurchargeHours, 0) * 100) / 100,
      sundaySurchargeHours: Math.round(turnosConMalla.reduce((s, t) => s + t.sundaySurchargeHours, 0) * 100) / 100,
      nightSundaySurchargeHours: Math.round(turnosConMalla.reduce((s, t) => s + t.nightSundaySurchargeHours, 0) * 100) / 100,
      totalHorasExtra: Math.round(totalHE * 100) / 100,
      totalRecargos: Math.round(totalRecargos * 100) / 100,
      totalHorasTrabajadas: Math.round(totalHorasTrabajadas * 100) / 100,
      totalDisponibilidades,
      totalKmRecorridos: Math.round(totalKmRecorridos * 100) / 100,
      registrosForaneo: fotosForaneo.length,
      fotos: user.tripRecords.map((f) => ({
        id: f.id,
        type: f.type,
        driveUrl: f.driveUrl,
        startKm: f.startKm,
        endKm: f.endKm,
        kmRecorridos: f.startKm != null && f.endKm != null ? Math.max(0, f.endKm - f.startKm) : null,
        notes: f.notes,
        createdAt: f.createdAt,
        approvalStatus: f.type === "FORANEO" ? f.approvalStatus : undefined,
        approvalNote: f.type === "FORANEO" ? f.approvalNote : undefined,
      })),
      turnos: turnosConMalla,
    };
  });

  const resumen = {
    totalTecnicos: detalle.length,
    totalHorasExtra: Math.round(detalle.reduce((s, d) => s + d.totalHorasExtra, 0) * 100) / 100,
    totalRecargos: Math.round(detalle.reduce((s, d) => s + d.totalRecargos, 0) * 100) / 100,
    totalHorasOrdinarias: Math.max(0, Math.round(detalle.reduce((s, d) => s + d.regularHours, 0) * 100) / 100),
    totalDisponibilidades: detalle.reduce((s, d) => s + d.totalDisponibilidades, 0),
    totalKmRecorridos: Math.round(detalle.reduce((s, d) => s + d.totalKmRecorridos, 0) * 100) / 100,
    totalRegistrosForaneo: detalle.reduce((s, d) => s + d.registrosForaneo, 0),
  };

  const alertasHE = detalle
    .filter((d) => d.totalHorasExtra > 40)
    .map((d) => ({ userId: d.userId, fullName: d.fullName, mensaje: `${d.fullName} acumula ${d.totalHorasExtra}h extras en el periodo` }));
  const alertas = [...alertasHE, ...alertasMalla];

  const foraneos = detalle.flatMap((d) =>
    d.fotos
      .filter((f) => f.type === "FORANEO")
      .map((f) => ({
        id: f.id,
        createdAt: f.createdAt,
        tecnico: d.fullName,
        documentNumber: d.documentNumber,
        correo: d.email,
        type: f.type,
        startKm: f.startKm,
        endKm: f.endKm,
        distancia: f.kmRecorridos,
        notes: f.notes,
        photoUrl: f.driveUrl || "",
      }))
  );

  return NextResponse.json({ detalle, resumen, alertas, foraneos });
}
