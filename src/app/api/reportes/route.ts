import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { calcularTurno, calcularHorasSemanalesConMalla, getInicioSemana, getFinSemana, checkMallaAlerts } from "@/lib/bia/calc-engine";
import { getDay } from "date-fns";

function dateKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const inicio = searchParams.get("inicio");
  const fin = searchParams.get("fin");
  const zona = searchParams.get("zona");
  const userId = searchParams.get("userId");
  const rol = searchParams.get("rol");

  if (!inicio || !fin) {
    return NextResponse.json({ error: "Parámetros inicio y fin requeridos" }, { status: 400 });
  }

  const whereUser: Record<string, unknown> = { isActive: true };
  if (zona && zona !== "ALL") whereUser.zona = zona;
  if (userId) whereUser.id = userId;
  if (rol && rol !== "ALL") whereUser.role = rol;

  if (session.user.role === "COORDINADOR") {
    whereUser.zona = session.user.zona;
  } else if (session.user.role === "TECNICO") {
    whereUser.id = session.user.userId;
  }

  const [yi, mi, di] = inicio.split("-").map(Number);
  const [yf, mf, df] = fin.split("-").map(Number);
  const fechaInicio = new Date(Date.UTC(yi, mi - 1, di, 0, 0, 0));
  const fechaFin = new Date(Date.UTC(yf, mf - 1, df, 23, 59, 59));

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
      disponibilidades: {
        where: { fecha: { gte: fechaInicio, lte: fechaFin } },
      },
      fotoRegistros: {
        where: { createdAt: { gte: fechaInicio, lte: fechaFin } },
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
    mallaMap.set(`${m.userId}|${dateKey(m.fecha)}`, m.valor);
  }

  const festivos = await prisma.festivo.findMany({
    where: { fecha: { gte: fechaInicio, lte: fechaFin } },
  });
  const holidaySet = new Set(festivos.map((f) => dateKey(f.fecha)));

  const alertasMalla: Array<{ userId: string; nombre: string; mensaje: string; tipo?: string }> = [];

  const detalle = usuarios.map((user) => {
    const mallaGetter = (fecha: Date) => mallaMap.get(`${user.id}|${dateKey(fecha)}`) ?? null;

    const turnosConMalla = user.turnos.map((t) => {
      const mallaVal = mallaGetter(t.fecha);
      const inicioSemana = getInicioSemana(t.fecha);
      const finSemana = getFinSemana(t.fecha);
      const turnosSemana = user.turnos.filter(
        (x) => x.fecha >= inicioSemana && x.fecha <= finSemana
      );
      const turnosData = turnosSemana.map((x) => ({
        fecha: x.fecha,
        horaEntrada: x.horaEntrada,
        horaSalida: x.horaSalida!,
        esFestivo: holidaySet.has(dateKey(x.fecha)),
        esDomingo: getDay(x.fecha) === 0,
      }));
      const resumenSemanal = calcularHorasSemanalesConMalla(turnosData, (f) => mallaMap.get(`${user.id}|${dateKey(f)}`) ?? null, holidaySet);
      const totalHoras = (t.horaSalida.getTime() - t.horaEntrada.getTime()) / (1000 * 60 * 60);
      const resultado = calcularTurno(
        {
          fecha: t.fecha,
          horaEntrada: t.horaEntrada,
          horaSalida: t.horaSalida!,
          esFestivo: holidaySet.has(dateKey(t.fecha)),
          esDomingo: getDay(t.fecha) === 0,
        },
        resumenSemanal,
        mallaVal,
        holidaySet
      );
      const alerts = checkMallaAlerts(t.id, user.email ?? "", t.fecha, mallaVal, holidaySet.has(dateKey(t.fecha)), totalHoras);
      alerts.forEach((a) => alertasMalla.push({ userId: user.id, nombre: user.nombre, mensaje: a.detalle, tipo: a.tipo }));

      return {
        ...t,
        ...resultado,
        malla: mallaVal ?? undefined,
      };
    });

    const totalHE = turnosConMalla.reduce((sum, t) => sum + t.heDiurna + t.heNocturna + t.heDominical + t.heNoctDominical, 0);
    const totalRecargos = turnosConMalla.reduce((sum, t) => sum + t.recNocturno + t.recDominical + t.recNoctDominical, 0);
    const totalOrdinarias = turnosConMalla.reduce((sum, t) => sum + t.horasOrdinarias, 0);
    const totalDisponibilidades = user.disponibilidades.reduce((sum, d) => sum + d.monto, 0);

    const fotosForaneo = user.fotoRegistros.filter((f) => f.tipo === "FORANEO");
    const totalKmRecorridos = fotosForaneo.reduce((sum, f) => {
      if (f.kmInicial != null && f.kmFinal != null && f.kmFinal > f.kmInicial) {
        return sum + (f.kmFinal - f.kmInicial);
      }
      return sum;
    }, 0);

    return {
      userId: user.id, nombre: user.nombre, cedula: user.cedula, email: user.email, zona: user.zona, role: user.role,
      totalTurnos: turnosConMalla.length,
      horasOrdinarias: Math.round(totalOrdinarias * 100) / 100,
      heDiurna: Math.round(turnosConMalla.reduce((s, t) => s + t.heDiurna, 0) * 100) / 100,
      heNocturna: Math.round(turnosConMalla.reduce((s, t) => s + t.heNocturna, 0) * 100) / 100,
      heDominical: Math.round(turnosConMalla.reduce((s, t) => s + t.heDominical, 0) * 100) / 100,
      heNoctDominical: Math.round(turnosConMalla.reduce((s, t) => s + t.heNoctDominical, 0) * 100) / 100,
      recNocturno: Math.round(turnosConMalla.reduce((s, t) => s + t.recNocturno, 0) * 100) / 100,
      recDominical: Math.round(turnosConMalla.reduce((s, t) => s + t.recDominical, 0) * 100) / 100,
      recNoctDominical: Math.round(turnosConMalla.reduce((s, t) => s + t.recNoctDominical, 0) * 100) / 100,
      totalHorasExtra: Math.round(totalHE * 100) / 100,
      totalRecargos: Math.round(totalRecargos * 100) / 100,
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
      })),
      turnos: turnosConMalla,
    };
  });

  const resumen = {
    totalTecnicos: detalle.length,
    totalHorasExtra: Math.round(detalle.reduce((s, d) => s + d.totalHorasExtra, 0) * 100) / 100,
    totalRecargos: Math.round(detalle.reduce((s, d) => s + d.totalRecargos, 0) * 100) / 100,
    totalHorasOrdinarias: Math.round(detalle.reduce((s, d) => s + d.horasOrdinarias, 0) * 100) / 100,
    totalDisponibilidades: detalle.reduce((s, d) => s + d.totalDisponibilidades, 0),
    totalKmRecorridos: Math.round(detalle.reduce((s, d) => s + d.totalKmRecorridos, 0) * 100) / 100,
    totalRegistrosForaneo: detalle.reduce((s, d) => s + d.registrosForaneo, 0),
  };

  const alertasHE = detalle
    .filter((d) => d.totalHorasExtra > 40)
    .map((d) => ({ userId: d.userId, nombre: d.nombre, mensaje: `${d.nombre} acumula ${d.totalHorasExtra}h extras en el período` }));
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
