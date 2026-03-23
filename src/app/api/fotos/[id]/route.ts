import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getInicioSemana, getFinSemana } from "@/lib/bia/calc-engine";
import { getDay } from "date-fns";
import { calcularHorasTurno, resultadoToTurnoData } from "@/lib/calcularHoras";
import { sumWeeklyOrdHoursMonSat } from "@/lib/weeklyOrdHours";
import { updateRowByMatch } from "@/lib/google-sheets";
import { uploadToDrive } from "@/lib/drive-upload";

function dateKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

function timeColombia(d: Date): string {
  return new Date(d).toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function checkCoordinadorZona(turnoUserId: string, session: { user: { zona?: string; role: string } }) {
  if (session.user.role !== "COORDINADOR") return true;
  const user = await prisma.user.findUnique({
    where: { id: turnoUserId },
    select: { zona: true, role: true },
  });
  return user?.role === "TECNICO" && user?.zona === session.user.zona;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const turno = await prisma.turno.findUnique({
    where: { id },
    include: { user: { select: { cedula: true, nombre: true, email: true, zona: true } } },
  });
  if (!turno) return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });

  const canAccess = session.user.role === "ADMIN" || session.user.role === "MANAGER" ||
    (session.user.role === "COORDINADOR" && await checkCoordinadorZona(turno.userId, session)) ||
    (session.user.role === "TECNICO" && turno.userId === session.user.userId);
  if (!canAccess) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  return NextResponse.json({ ok: true, turno });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await params;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }

    // ——— FotoRegistro (foráneo: finalizar con foto + km, o editar km/obs) ———
    const fotoRec = await prisma.fotoRegistro.findUnique({ where: { id } });
    if (fotoRec) {
      if (session.user.role !== "TECNICO" || fotoRec.userId !== session.user.userId) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }

      const base64Data = body.base64Data as string | undefined;
      const hasFinalize = base64Data != null && base64Data !== "" && body.kmFinal != null && body.kmFinal !== "";

      if (hasFinalize) {
        if (fotoRec.tipo !== "FORANEO" || fotoRec.kmFinal != null) {
          return NextResponse.json({ error: "Foráneo ya finalizado o no es un registro foráneo activo" }, { status: 400 });
        }
        const kmFinalNum = parseFloat(String(body.kmFinal));
        if (Number.isNaN(kmFinalNum) || fotoRec.kmInicial == null || kmFinalNum <= fotoRec.kmInicial) {
          return NextResponse.json({ error: "Km final inválido" }, { status: 400 });
        }

        const latFinal = body.latFinal;
        const lngFinal = body.lngFinal;

        let driveFileIdFinal: string | null = null;
        let driveUrlFinal: string | null = null;
        try {
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const fileName = `foraneo_fin_${fotoRec.userId}_${timestamp}.jpg`;
          const result = await uploadToDrive(base64Data, fileName);
          driveFileIdFinal = result.fileId;
          driveUrlFinal = result.webViewLink;
        } catch (e) {
          console.error("[PATCH /api/fotos/[id]] Error subiendo foto final a Drive:", e);
          return NextResponse.json({ error: "No se pudo subir la foto final a Drive" }, { status: 500 });
        }

        const actualizado = await prisma.fotoRegistro.update({
          where: { id },
          data: {
            kmFinal: kmFinalNum,
            driveFileIdFinal,
            driveUrlFinal,
            latFinal: latFinal != null ? parseFloat(String(latFinal)) : null,
            lngFinal: lngFinal != null ? parseFloat(String(lngFinal)) : null,
          },
        });
        return NextResponse.json({ ok: true, registro: actualizado });
      }

      const data: {
        kmInicial?: number | null;
        kmFinal?: number | null;
        observaciones?: string | null;
      } = {};
      if ("kmInicial" in body) {
        data.kmInicial =
          body.kmInicial != null && body.kmInicial !== ""
            ? parseFloat(String(body.kmInicial))
            : null;
      }
      if ("kmFinal" in body) {
        data.kmFinal =
          body.kmFinal != null && body.kmFinal !== "" ? parseFloat(String(body.kmFinal)) : null;
      }
      if ("observaciones" in body) {
        data.observaciones = (body.observaciones as string) || null;
      }
      if (Object.keys(data).length === 0) {
        return NextResponse.json({ error: "Sin campos para actualizar" }, { status: 400 });
      }

      const actualizado = await prisma.fotoRegistro.update({
        where: { id },
        data,
      });
      return NextResponse.json({ ok: true, registro: actualizado });
    }

    // ——— Turno (coordinador / admin / manager) ———
    const turno = await prisma.turno.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!turno) return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });

    const canEdit = session.user.role === "ADMIN" || session.user.role === "MANAGER" ||
      (session.user.role === "COORDINADOR" && await checkCoordinadorZona(turno.userId, session));
    if (!canEdit) return NextResponse.json({ error: "Solo coordinador o superior puede editar este turno" }, { status: 403 });

    if (turno.observaciones?.startsWith("Cancelado")) {
      return NextResponse.json({ error: "No se puede editar un turno cancelado" }, { status: 400 });
    }

    const horaEntradaISO = body.horaEntrada as string | undefined;
    const horaSalidaISO = body.horaSalida as string | undefined;
    const notes = body.observaciones as string | undefined;

    const newEntrada = horaEntradaISO ? new Date(horaEntradaISO) : turno.horaEntrada;
    const newSalida = horaSalidaISO ? new Date(horaSalidaISO) : turno.horaSalida;

    // Calcular fecha en Colombia (UTC-5)
    const ahoraColombia = new Date(newEntrada.getTime() - 5 * 60 * 60 * 1000);
    const fecha = new Date(Date.UTC(
      ahoraColombia.getUTCFullYear(),
      ahoraColombia.getUTCMonth(),
      ahoraColombia.getUTCDate()
    ));

    if (!newSalida) {
      await prisma.turno.update({
        where: { id },
        data: {
          horaEntrada: newEntrada,
          fecha,
          observaciones: notes ? `${notes} [Editado ${new Date().toISOString()}]` : turno.observaciones,
        },
      });
      return NextResponse.json({ ok: true, msg: "Hora de inicio actualizada" });
    }

    const inicioSemana = getInicioSemana(fecha);
    const finSemana = getFinSemana(fecha);

    const [mallaDiaRow, festivosSemana, turnosSemana] = await Promise.all([
      prisma.mallaTurno.findUnique({
        where: { userId_fecha: { userId: turno.userId, fecha } },
      }),
      prisma.festivo.findMany({
        where: { fecha: { gte: inicioSemana, lte: finSemana } },
      }),
      prisma.turno.findMany({
        where: {
          userId: turno.userId,
          fecha: { gte: inicioSemana, lte: finSemana },
          horaSalida: { not: null },
          id: { not: id },
          OR: [
            { observaciones: null },
            { observaciones: { not: { startsWith: "Cancelado" } } },
          ],
        },
        select: { fecha: true, horasOrdinarias: true },
      }),
    ]);

    const holidaySet = new Set(festivosSemana.map((f) => dateKey(f.fecha)));
    const esFestivo = holidaySet.has(dateKey(fecha));
    const weeklyOrdHours = sumWeeklyOrdHoursMonSat(turnosSemana);

    type MallaRow = { tipo?: string | null; valor: string; horaInicio?: string | null; horaFin?: string | null };
    const row = mallaDiaRow as MallaRow | null;
    const mallaDia = row
      ? {
          tipo: esFestivo ? "FESTIVO" : (row.tipo ?? "TRABAJO"),
          valor: row.valor ?? null,
          horaInicio: row.horaInicio,
          horaFin: row.horaFin,
        }
      : esFestivo
        ? { tipo: "FESTIVO" as const, valor: null, horaInicio: null, horaFin: null }
        : getDay(fecha) === 0
          ? { tipo: "DESCANSO" as const, valor: null, horaInicio: null, horaFin: null }
          : {
              tipo: "TRABAJO" as const,
              valor: "Trabajo",
              horaInicio: "08:00",
              horaFin: getDay(fecha) === 6 ? "12:00" : "17:00",
            };

    const resultado = calcularHorasTurno(
      { horaEntrada: newEntrada, horaSalida: newSalida, fecha },
      mallaDia,
      holidaySet,
      weeklyOrdHours
    );
    const resultadoDb = resultadoToTurnoData(resultado);

    await prisma.turno.update({
      where: { id },
      data: {
        fecha,
        horaEntrada: newEntrada,
        horaSalida: newSalida,
        observaciones: notes ? `${notes} [Editado ${new Date().toISOString()}]` : turno.observaciones,
        ...resultadoDb,
      },
    });

    const totalHoras = Math.round(((newSalida.getTime() - newEntrada.getTime()) / (1000 * 60 * 60)) * 100) / 100;
    updateRowByMatch("Turnos", [
      { columnIndex: 0, value: turno.user.nombre },
      { columnIndex: 2, value: dateKey(turno.fecha) },
    ], [
      turno.user.nombre,
      turno.user.cedula ?? "",
      dateKey(fecha),
      timeColombia(newEntrada),
      timeColombia(newSalida),
      totalHoras,
      Math.max(0, resultadoDb.horasOrdinarias ?? 0),
      resultadoDb.heDiurna ?? 0,
      resultadoDb.heNocturna ?? 0,
      resultadoDb.heDominical ?? 0,
      resultadoDb.heNoctDominical ?? 0,
      resultadoDb.recNocturno ?? 0,
      resultadoDb.recDominical ?? 0,
      resultadoDb.recNoctDominical ?? 0,
    ]).catch(console.error);

    return NextResponse.json({
      ok: true,
      msg: `Turno actualizado. Ord: ${resultadoDb.horasOrdinarias}h, HE: ${resultadoDb.heDiurna + resultadoDb.heNocturna}h`,
      turno: { ...resultadoDb, fecha: dateKey(fecha) },
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
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const turno = await prisma.turno.findUnique({ where: { id } });
  if (!turno) return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });

  const canDelete = session.user.role === "ADMIN" || session.user.role === "MANAGER" ||
    (session.user.role === "COORDINADOR" && await checkCoordinadorZona(turno.userId, session));
  if (!canDelete) return NextResponse.json({ error: "No autorizado para cancelar este turno" }, { status: 403 });

  await prisma.turno.update({
    where: { id },
    data: {
      observaciones: `Cancelado por coordinador ${new Date().toISOString()}`,
    },
  });
  return NextResponse.json({ ok: true, msg: "Turno cancelado" });
}