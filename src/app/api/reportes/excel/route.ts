export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { prisma } from "@/lib/prisma";
import type { Zone, Prisma } from "@prisma/client";
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

function diaSemana(d: Date): string {
  return new Date(d).toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    weekday: "long",
  });
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const profile = await getUserProfile(user.email!);
    if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const desde = searchParams.get("desde");
    const hasta = searchParams.get("hasta");
    const userId = searchParams.get("userId");
    const zona = searchParams.get("zona");

    if (!desde || !hasta) {
      return NextResponse.json({ error: "Parametros desde y hasta requeridos" }, { status: 400 });
    }

    const [yi, mi, di] = desde.split("-").map(Number);
    const [yf, mf, df] = hasta.split("-").map(Number);
    const fechaInicio = new Date(Date.UTC(yi, mi - 1, di, 0, 0, 0));
    const fechaFin = new Date(Date.UTC(yf, mf - 1, df, 23, 59, 59));

    const whereUser: { isActive: boolean; role: "TECNICO"; id?: string; zone?: string } = {
      isActive: true,
      role: "TECNICO",
    };
    if (userId) whereUser.id = userId;
    if (zona && zona !== "ALL") whereUser.zone = zona as Zone;
    if (profile.role === "COORDINADOR" || profile.role === "SUPPLY") {
      whereUser.zone = profile.zone as Zone;
    } else if (profile.role === "TECNICO") {
      whereUser.id = profile.id;
    }

    const usuarios = await prisma.user.findMany({
      where: whereUser as unknown as Prisma.UserWhereInput,
      select: { id: true },
    });
    const userIds = usuarios.map((u) => u.id);

    if (userIds.length === 0) {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Resumen");
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
      prisma.shift.findMany({
        where: {
          userId: { in: userIds },
          date: { gte: fechaInicio, lte: fechaFin },
          clockOutAt: { not: null },
        },
        include: { user: { select: { fullName: true, documentNumber: true } } },
        orderBy: [{ date: "asc" }, { clockInAt: "asc" }],
      }),
      prisma.shiftSchedule.findMany({
        where: {
          dayType: "DISPONIBLE",
          userId: { in: userIds },
          date: { gte: fechaInicio, lte: fechaFin },
        },
        include: { user: { select: { fullName: true, documentNumber: true } } },
        orderBy: [{ userId: "asc" }, { date: "asc" }],
      }),
      prisma.tripRecord.findMany({
        where: {
          type: "FORANEO",
          approvalStatus: "APROBADA",
          userId: { in: userIds },
          createdAt: { gte: fechaInicio, lte: fechaFin },
        },
        include: { user: { select: { fullName: true, documentNumber: true } } },
      }),
    ]);

    // Hoja Resumen — una fila por técnico con totales
    const resumenPorTecnico: Record<string, {
      Nombre: string;
      Cedula: string | null;
      "Total Turnos": number;
      "Total Horas Trabajadas": number;
      "Horas Ordinarias": number;
      "HE Diurna": number;
      "HE Nocturna": number;
      "HE Dom/Fest Diurna": number;
      "HE Dom/Fest Nocturna": number;
      "Recargo Nocturno": number;
      "Recargo Dom/Fest Diurno": number;
      "Recargo Dom/Fest Nocturno": number;
      "Total HE": number;
      "Total Recargos": number;
    }> = {};

    turnos.forEach((t) => {
      const key = t.userId;
      const totalHoras = t.clockOutAt
        ? Math.round(((t.clockOutAt.getTime() - t.clockInAt.getTime()) / (1000 * 60 * 60)) * 100) / 100
        : 0;
      if (!resumenPorTecnico[key]) {
        resumenPorTecnico[key] = {
          Nombre: t.user.fullName,
          Cedula: t.user.documentNumber,
          "Total Turnos": 0,
          "Total Horas Trabajadas": 0,
          "Horas Ordinarias": 0,
          "HE Diurna": 0,
          "HE Nocturna": 0,
          "HE Dom/Fest Diurna": 0,
          "HE Dom/Fest Nocturna": 0,
          "Recargo Nocturno": 0,
          "Recargo Dom/Fest Diurno": 0,
          "Recargo Dom/Fest Nocturno": 0,
          "Total HE": 0,
          "Total Recargos": 0,
        };
      }
      resumenPorTecnico[key]["Total Turnos"] += 1;
      resumenPorTecnico[key]["Total Horas Trabajadas"] += totalHoras;
      resumenPorTecnico[key]["Horas Ordinarias"] += Math.max(0, t.regularHours ?? 0);
      resumenPorTecnico[key]["HE Diurna"] += t.daytimeOvertimeHours ?? 0;
      resumenPorTecnico[key]["HE Nocturna"] += t.nighttimeOvertimeHours ?? 0;
      resumenPorTecnico[key]["HE Dom/Fest Diurna"] += t.sundayOvertimeHours ?? 0;
      resumenPorTecnico[key]["HE Dom/Fest Nocturna"] += t.nightSundayOvertimeHours ?? 0;
      resumenPorTecnico[key]["Recargo Nocturno"] += t.nightSurchargeHours ?? 0;
      resumenPorTecnico[key]["Recargo Dom/Fest Diurno"] += t.sundaySurchargeHours ?? 0;
      resumenPorTecnico[key]["Recargo Dom/Fest Nocturno"] += t.nightSundaySurchargeHours ?? 0;
      resumenPorTecnico[key]["Total HE"] += (t.daytimeOvertimeHours ?? 0) + (t.nighttimeOvertimeHours ?? 0) + (t.sundayOvertimeHours ?? 0) + (t.nightSundayOvertimeHours ?? 0);
      resumenPorTecnico[key]["Total Recargos"] += (t.nightSurchargeHours ?? 0) + (t.sundaySurchargeHours ?? 0) + (t.nightSundaySurchargeHours ?? 0);
    });

    const dataResumen = Object.values(resumenPorTecnico).map((r) => ({
      ...r,
      "Total Horas Trabajadas": Math.round(r["Total Horas Trabajadas"] * 100) / 100,
      "Horas Ordinarias": Math.round(r["Horas Ordinarias"] * 100) / 100,
      "Total HE": Math.round(r["Total HE"] * 100) / 100,
      "Total Recargos": Math.round(r["Total Recargos"] * 100) / 100,
    }));

    // Hoja Turnos — detalle con columna Día
    const dataTurnos = turnos.map((t) => {
      const totalHoras = t.clockOutAt
        ? Math.round(((t.clockOutAt.getTime() - t.clockInAt.getTime()) / (1000 * 60 * 60)) * 100) / 100
        : 0;
      return {
        Nombre: t.user.fullName,
        Cedula: t.user.documentNumber,
        Fecha: dateKey(t.date),
        Día: diaSemana(t.date),
        Entrada: timeColombia(t.clockInAt),
        Salida: t.clockOutAt ? timeColombia(t.clockOutAt) : "",
        "Total Horas": totalHoras,
        "Horas Ordinarias": Math.max(0, t.regularHours ?? 0),
        "HE Diurna": t.daytimeOvertimeHours ?? 0,
        "HE Nocturna": t.nighttimeOvertimeHours ?? 0,
        "HE Dom/Fest Diurna": t.sundayOvertimeHours ?? 0,
        "HE Dom/Fest Nocturna": t.nightSundayOvertimeHours ?? 0,
        "Recargo Nocturno": t.nightSurchargeHours ?? 0,
        "Recargo Dom/Fest Diurno": t.sundaySurchargeHours ?? 0,
        "Recargo Dom/Fest Nocturno": t.nightSundaySurchargeHours ?? 0,
      };
    });

    // Hoja Disponibilidades
    const dataDisponibilidades = mallaDisponibles.map((m) => ({
      Nombre: m.user.fullName,
      Cedula: m.user.documentNumber,
      Fecha: dateKey(m.date),
      Valor: VALOR_DISPONIBILIDAD,
    }));

    // Hoja Foraneos — agrupados por técnico
    const foraneosPorTecnico: Record<string, {
      Nombre: string;
      Cedula: string | null;
      "Cantidad Foraneos": number;
      "Total Km": number;
      "Total a Pagar": number;
    }> = {};

    fotosForaneos.forEach((f) => {
      const key = f.userId;
      const km = f.startKm != null && f.endKm != null && f.endKm > f.startKm
        ? f.endKm - f.startKm : 0;
      if (!foraneosPorTecnico[key]) {
        foraneosPorTecnico[key] = {
          Nombre: f.user.fullName,
          Cedula: f.user.documentNumber,
          "Cantidad Foraneos": 0,
          "Total Km": 0,
          "Total a Pagar": 0,
        };
      }
      foraneosPorTecnico[key]["Cantidad Foraneos"] += 1;
      foraneosPorTecnico[key]["Total Km"] += km;
      foraneosPorTecnico[key]["Total a Pagar"] += Math.round(km * TARIFA_KM_FORANEO);
    });

    const dataForaneos = Object.values(foraneosPorTecnico).map((r) => ({
      ...r,
      "Total Km": Math.round(r["Total Km"] * 100) / 100,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataResumen), "Resumen");
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
