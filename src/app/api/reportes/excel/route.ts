export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

const VALOR_DISPONIBILIDAD = 80000;
const TARIFA_KM_FORANEO = 1100;

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

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const desde = searchParams.get("desde");
    const hasta = searchParams.get("hasta");
    const userId = searchParams.get("userId");
    const zona = searchParams.get("zona");

    if (!desde || !hasta) {
      return NextResponse.json(
        { error: "Parámetros desde y hasta requeridos (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const [yi, mi, di] = desde.split("-").map(Number);
    const [yf, mf, df] = hasta.split("-").map(Number);
    const fechaInicio = new Date(Date.UTC(yi, mi - 1, di, 0, 0, 0));
    const fechaFin = new Date(Date.UTC(yf, mf - 1, df, 23, 59, 59));

    const whereUser: { isActive: boolean; role: string; id?: string; zona?: string } = {
      isActive: true,
      role: "TECNICO",
    };
    if (userId) whereUser.id = userId;
    if (zona && zona !== "ALL") whereUser.zona = zona as "BOGOTA" | "COSTA";
    if (session.user.role === "COORDINADOR") {
      whereUser.zona = session.user.zona as "BOGOTA" | "COSTA";
    } else if (session.user.role === "TECNICO") {
      whereUser.id = session.user.userId;
    }

    const usuarios = await prisma.user.findMany({
      where: whereUser,
      select: { id: true },
    });
    const userIds = usuarios.map((u) => u.id);
    if (userIds.length === 0) {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Turnos");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Disponibilidades");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Foraneos");
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="reporte_${desde}_${hasta}.xlsx"`,
        },
      });
    }

    const [turnos, mallaDisponibles, fotosForaneos] = await Promise.all([
      prisma.turno.findMany({
        where: {
          userId: { in: userIds },
          fecha: { gte: fechaInicio, lte: fechaFin },
          horaSalida: { not: null },
        },
        include: { user: { select: { nombre: true, cedula: true } } },
        orderBy: [{ fecha: "asc" }, { horaEntrada: "asc" }],
      }),
      prisma.mallaTurno.findMany({
        where: {
          tipo: "DISPONIBLE",
          userId: { in: userIds },
          fecha: { gte: fechaInicio, lte: fechaFin },
        },
        include: { user: { select: { nombre: true, cedula: true } } },
        orderBy: [{ userId: "asc" }, { fecha: "asc" }],
      }),
      prisma.fotoRegistro.findMany({
        where: {
          tipo: "FORANEO",
          userId: { in: userIds },
          createdAt: { gte: fechaInicio, lte: fechaFin },
        },
        include: { user: { select: { nombre: true, cedula: true } } },
      }),
    ]);

    const dataTurnos = turnos.map((t) => ({
      Nombre: t.user.nombre,
      Cédula: t.user.cedula,
      Fecha: dateKey(t.fecha),
      Entrada: timeColombia(t.horaEntrada),
      Salida: t.horaSalida ? timeColombia(t.horaSalida) : "",
      "Horas Ordinarias": t.horasOrdinarias ?? 0,
      "HE Diurna": t.heDiurna ?? 0,
      "HE Nocturna": t.heNocturna ?? 0,
      "Recargo Nocturno": t.recNocturno ?? 0,
      "Recargo Dominical": t.recDominical ?? 0,
    }));

    const dataDisponibilidades = mallaDisponibles.map((m) => ({
      Nombre: m.user.nombre,
      Cédula: m.user.cedula,
      Fecha: dateKey(m.fecha),
      Valor: VALOR_DISPONIBILIDAD,
    }));

    const dataForaneos = fotosForaneos.map((f) => {
      const km =
        f.kmInicial != null && f.kmFinal != null && f.kmFinal > f.kmInicial
          ? f.kmFinal - f.kmInicial
          : 0;
      return {
        Nombre: f.user.nombre,
        Cédula: f.user.cedula,
        Fecha: dateKey(f.createdAt),
        "Cantidad Foráneos": 1,
        "Total Km": Math.round(km * 100) / 100,
        "Total a Pagar": Math.round(km * TARIFA_KM_FORANEO),
      };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataTurnos), "Turnos");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataDisponibilidades), "Disponibilidades");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataForaneos), "Foraneos");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="reporte_${desde}_${hasta}.xlsx"`,
      },
    });
  } catch (e) {
    console.error("[reportes/excel]", e);
    return NextResponse.json({ error: "Error al generar Excel" }, { status: 500 });
  }
}
