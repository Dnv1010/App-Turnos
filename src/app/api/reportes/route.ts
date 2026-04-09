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
    whereUser.zona = profile.zona;
  } else if (profile.role === "SUPPLY") {
    if (zona && zona !== "ALL") whereUser.zona = zona;
  } else if (profile.role === "TECNICO") {
    whereUser.id = profile.id;
  } else if (zona && zona !== "ALL") {
    whereUser.zona = zona;
  }

  const [yi, mi, di] = inicio.split("-").map(Number);
  const [yf, mf, df] = fin.split("-").map(Number);
  const fechaInicio = new Date(Date.UTC(yi!, mi! - 1, di!, 0, 0, 0));
  const fechaFin = new Date(Date.UTC(yf!, mf! - 1, df!, 23, 59, 59));

  const usuarios = await prisma.user.findMany({
    where: whereUser,
    select: {
      id: true, nombre: true, cedula: true, email: true, zona: true, role: true,
      turnos: {
        where: {
          fecha: { gte: fechaInicio, lte: fechaFin },
          horaSalida: { not: null },
          OR: [
            { observaciones: null },
            { observaciones: { not: { startsWith: "Cancelado" } } },
          ],
        },
        orderBy: { fecha: "asc" },
      },
      mallaTurnos: {
        where: {
          fecha: { gte: fechaInicio, lte: fechaFin },
          tipo: "DISPONIBLE",
        },
      },
      fotoRegistros: {
        where: {
          createdAt: { gte: fechaInicio, lte: fechaFin },
          OR: [{ tipo: { not: "FORANEO" } }, { tipo: "FORANEO", estadoAprobacion: "APROBADA" }],
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const userIds = usuarios.map((u) => u.id);
  const mallaDB = await prisma.mallaTurno.findMany({
    where: {
      userId: { in: userIds },
      fecha: { gte: fechaInicio, lte: fechaFin },
    },
  });
  const mallaMap = new Map<string, string>();
  for (const m of mallaDB) {
    mallaMap.set(`${m.userId}|${dateKeyColombia(m.fecha)}`, m.valor);
  }

  const festivos = await prisma.festivo.findMany({
    where: { fecha: { gte: fechaInicio, lte: fechaFin } },
  });
  const holidaySet = new Set(festivos.map((f) => dateKeyColombia(f.fecha)));

  const alertasMalla: Array<{ userId: string; nombre: string; mensaje: string; tipo?: string }> = [];

  const detalle = usuarios.map((user) => {
    const mallaGetter = (fecha: Date) => mallaMap.get(`${user.id}|${dateKeyColombia(fecha)}`) ?? null;

    // Pre-agrupar por semana para evitar O(n²): filter dentro de map
    const turnosPorSemana = new Map<number, typeof user.turnos>();
    for (const t of user.turnos) {
      const key = getInicioSemana(t.fecha).getTime();
      if (!turnosPorSemana.has(key)) turnosPorSemana.set(key, []);
      turnosPorSemana.get(key)!.push(t);
    }

    const turnosConMalla = user.turnos.map((t) => {
      const mallaVal = mallaGetter(t.fecha);
      const inicioSemana = getInicioSemana(t.fecha);
      const turnosSemana = turnosPorSemana.get(inicioSemana.getTime()) ?? [];
      const weeklyOrdParaRegla44 = sumWeeklyOrdHoursMonSat(
        turnosSemana.map((x) => ({
          id: x.id,
          fecha: x.fecha,
          horasOrdinarias: x.horasOrdinarias,
        })),
        t.id
      );
      const resumenSemanal = {
        horasOrdinariasSemana: Math.round(weeklyOrdParaRegla44 * 100) / 100,
        aplicaRegla44h: weeklyOrdParaRegla44 < 44,
      };
      const totalHoras = (t.horaSalida!.getTime() - t.horaEntrada.getTime()) / (1000 * 60 * 60);
      const resultado = calcularTurno(
        {
          fecha: t.fecha,
          horaEntrada: t.horaEntrada,
          horaSalida: t.horaSalida!,
          esFestivo: holidaySet.has(dateKeyColombia(t.fecha)),
          // FIX: usar getDayOfWeekColombia corregida que respeta midnight UTC
          esDomingo: getDayOfWeekColombia(t.fecha) === 0,
        },
        resumenSemanal,
        mallaVal,
        holidaySet
      );
      const alerts = checkMallaAlerts(t.id, user.email ?? "", user.nombre, t.fecha, mallaVal, holidaySet.has(dateKeyColombia(t.fecha)), totalHoras);
      alerts.forEach((a) => alertasMalla.push({ userId: user.id, nombre: user.nombre, mensaje: a.detalle, tipo: a.tipo }));

      return {
        ...t,
        ...resultado,
        horasOrdinarias: Math.max(0, resultado.horasOrdinarias ?? 0),
        malla: mallaVal ?? undefined,
      };
    });

    const totalHE = turnosConMalla.reduce((sum, t) => sum + t.heDiurna + t.heNocturna + t.heDominical + t.heNoctDominical, 0);
    const totalRecargos = turnosConMalla.reduce((sum, t) => sum + t.recNocturno + t.recDominical + t.recNoctDominical, 0);
    const totalOrdinarias = turnosConMalla.reduce((sum, t) => sum + Math.max(0, t.horasOrdinarias ?? 0), 0);
    const totalDisponibilidades = user.mallaTurnos.reduce(
      (sum) => sum + valorDisponibilidadMallaPorRol(user.role), 0
    );

    const fotosForaneo = user.fotoRegistros.filter((f) => f.tipo === "FORANEO");
    const totalKmRecorridos = fotosForaneo.reduce((sum, f) => {
      if (f.kmInicial != null && f.kmFinal != null && f.kmFinal > f.kmInicial) {
        return sum + (f.kmFinal - f.kmInicial);
      }
      return sum;
    }, 0);

    const totalHorasTrabajadas = turnosConMalla.reduce((sum, t) => {
      if (t.horaSalida) {
        return sum + (new Date(t.horaSalida).getTime() - new Date(t.horaEntrada).getTime()) / (1000 * 60 * 60);
      }
      return sum;
    }, 0);

    return {
      userId: user.id, nombre: user.nombre, cedula: user.cedula, email: user.email, zona: user.zona, role: user.role,
      totalTurnos: turnosConMalla.length,
      horasOrdinarias: Math.max(0, Math.round(totalOrdinarias * 100) / 100),
      heDiurna: Math.round(turnosConMalla.reduce((s, t) => s + t.heDiurna, 0) * 100) / 100,
      heNocturna: Math.round(turnosConMalla.reduce((s, t) => s + t.heNocturna, 0) * 100) / 100,
      heDominical: Math.round(turnosConMalla.reduce((s, t) => s + t.heDominical, 0) * 100) / 100,
      heNoctDominical: Math.round(turnosConMalla.reduce((s, t) => s + t.heNoctDominical, 0) * 100) / 100,
      recNocturno: Math.round(turnosConMalla.reduce((s, t) => s + t.recNocturno, 0) * 100) / 100,
      recDominical: Math.round(turnosConMalla.reduce((s, t) => s + t.recDominical, 0) * 100) / 100,
      recNoctDominical: Math.round(turnosConMalla.reduce((s, t) => s + t.recNoctDominical, 0) * 100) / 100,
      totalHorasExtra: Math.round(totalHE * 100) / 100,
      totalRecargos: Math.round(totalRecargos * 100) / 100,
      totalHorasTrabajadas: Math.round(totalHorasTrabajadas * 100) / 100,
      totalDisponibilidades,
      totalKmRecorridos: Math.round(totalKmRecorridos * 100) / 100,
      registrosForaneo: fotosForaneo.length,
      fotos: user.fotoRegistros.map((f) => ({
        id: f.id,
        tipo: f.tipo,
        driveUrl: f.driveUrl,
        kmInicial: f.kmInicial,
        kmFinal: f.kmFinal,
        kmRecorridos: f.kmInicial != null && f.kmFinal != null ? Math.max(0, f.kmFinal - f.kmInicial) : null,
        observaciones: f.observaciones,
        fecha: f.createdAt,
        estadoAprobacion: f.tipo === "FORANEO" ? f.estadoAprobacion : undefined,
        notaAprobacion: f.tipo === "FORANEO" ? f.notaAprobacion : undefined,
      })),
      turnos: turnosConMalla,
    };
  });

  const resumen = {
    totalTecnicos: detalle.length,
    totalHorasExtra: Math.round(detalle.reduce((s, d) => s + d.totalHorasExtra, 0) * 100) / 100,
    totalRecargos: Math.round(detalle.reduce((s, d) => s + d.totalRecargos, 0) * 100) / 100,
    totalHorasOrdinarias: Math.max(0, Math.round(detalle.reduce((s, d) => s + d.horasOrdinarias, 0) * 100) / 100),
    totalDisponibilidades: detalle.reduce((s, d) => s + d.totalDisponibilidades, 0),
    totalKmRecorridos: Math.round(detalle.reduce((s, d) => s + d.totalKmRecorridos, 0) * 100) / 100,
    totalRegistrosForaneo: detalle.reduce((s, d) => s + d.registrosForaneo, 0),
  };

  const alertasHE = detalle
    .filter((d) => d.totalHorasExtra > 40)
    .map((d) => ({ userId: d.userId, nombre: d.nombre, mensaje: `${d.nombre} acumula ${d.totalHorasExtra}h extras en el periodo` }));
  const alertas = [...alertasHE, ...alertasMalla];

  const foraneos = detalle.flatMap((d) =>
    d.fotos
      .filter((f) => f.tipo === "FORANEO")
      .map((f) => ({
        id: f.id,
        fecha: f.fecha,
        tecnico: d.nombre,
        cedula: d.cedula,
        correo: d.email,
        tipo: f.tipo,
        kmInicial: f.kmInicial,
        kmFinal: f.kmFinal,
        distancia: f.kmRecorridos,
        observaciones: f.observaciones,
        fotoUrl: f.driveUrl || "",
      }))
  );

  return NextResponse.json({ detalle, resumen, alertas, foraneos });
}