export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { prisma } from "@/lib/prisma";
import type { Zona } from "@prisma/client";
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

    const whereUser: { isActive: boolean; role: "TECNICO"; id?: string; zona?: string } = {
      isActive: true,
      role: "TECNICO",
    };
    if (userId) whereUser.id = userId;
    if (zona && zona !== "ALL") whereUser.zona = zona as Zona;
    if (profile.role === "COORDINADOR" || profile.role === "SUPPLY") {
      whereUser.zona = profile.zona as Zona;
    } else if (profile.role === "TECNICO") {
      whereUser.id = profile.id;
    }

    const usuarios = await prisma.user.findMany({
      where: whereUser,
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
      prisma.turno.findMany({
        where: {
          userId: { in: userIds },
          fecha: { gte: fechaInicio, lte: fechaFin },
          horaSalida: { not: null },
        },
        select: {
          userId: true,
          fecha: true,
          horaEntrada: true,
          horaSalida: true,
          horasOrdinarias: true,
          heDiurna: true,
          heNocturna: true,
          heDominical: true,
          heNoctDominical: true,
          recNocturno: true,
          recDominical: true,
          recNoctDominical: true,
          user: { select: { nombre: true, cedula: true } },
        },
        orderBy: [{ fecha: "asc" }, { horaEntrada: "asc" }],
      }),
      prisma.mallaTurno.findMany({
        where: {
          tipo: "DISPONIBLE",
          userId: { in: userIds },
          fecha: { gte: fechaInicio, lte: fechaFin },
        },
        select: {
          userId: true,
          fecha: true,
          user: { select: { nombre: true, cedula: true } },
        },
        orderBy: [{ userId: "asc" }, { fecha: "asc" }],
      }),
      prisma.fotoRegistro.findMany({
        where: {
          tipo: "FORANEO",
          estadoAprobacion: "APROBADA",
          userId: { in: userIds },
          createdAt: { gte: fechaInicio, lte: fechaFin },
        },
        select: {
          userId: true,
          kmInicial: true,
          kmFinal: true,
          user: { select: { nombre: true, cedula: true } },
        },
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
      const totalHoras = t.horaSalida
        ? Math.round(((t.horaSalida.getTime() - t.horaEntrada.getTime()) / (1000 * 60 * 60)) * 100) / 100
        : 0;
      if (!resumenPorTecnico[key]) {
        resumenPorTecnico[key] = {
          Nombre: t.user.nombre,
          Cedula: t.user.cedula,
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
      resumenPorTecnico[key]["Horas Ordinarias"] += Math.max(0, t.horasOrdinarias ?? 0);
      resumenPorTecnico[key]["HE Diurna"] += t.heDiurna ?? 0;
      resumenPorTecnico[key]["HE Nocturna"] += t.heNocturna ?? 0;
      resumenPorTecnico[key]["HE Dom/Fest Diurna"] += t.heDominical ?? 0;
      resumenPorTecnico[key]["HE Dom/Fest Nocturna"] += t.heNoctDominical ?? 0;
      resumenPorTecnico[key]["Recargo Nocturno"] += t.recNocturno ?? 0;
      resumenPorTecnico[key]["Recargo Dom/Fest Diurno"] += t.recDominical ?? 0;
      resumenPorTecnico[key]["Recargo Dom/Fest Nocturno"] += t.recNoctDominical ?? 0;
      resumenPorTecnico[key]["Total HE"] += (t.heDiurna ?? 0) + (t.heNocturna ?? 0) + (t.heDominical ?? 0) + (t.heNoctDominical ?? 0);
      resumenPorTecnico[key]["Total Recargos"] += (t.recNocturno ?? 0) + (t.recDominical ?? 0) + (t.recNoctDominical ?? 0);
    });

    const dataResumen = Object.values(resumenPorTecnico).map((r) => ({
      ...r,
      "Total Horas Trabajadas": Math.round(r["Total Horas Trabajadas"] * 100) / 100,
      "Horas Ordinarias": Math.round(r["Horas Ordinarias"] * 100) / 100,
      "Total HE": Math.round(r["Total HE"] * 100) / 100,
      "Total Recargos": Math.round(r["Total Recargos"] * 100) / 100,
    }));

    // Hoja Turnos — detalle de cada turno
    const dataTurnos = turnos.map((t) => {
      const totalHoras = t.horaSalida
        ? Math.round(((t.horaSalida.getTime() - t.horaEntrada.getTime()) / (1000 * 60 * 60)) * 100) / 100
        : 0;
      return {
        Nombre: t.user.nombre,
        Cedula: t.user.cedula,
        Fecha: dateKey(t.fecha),
        Entrada: timeColombia(t.horaEntrada),
        Salida: t.horaSalida ? timeColombia(t.horaSalida) : "",
        "Total Horas": totalHoras,
        "Horas Ordinarias": Math.max(0, t.horasOrdinarias ?? 0),
        "HE Diurna": t.heDiurna ?? 0,
        "HE Nocturna": t.heNocturna ?? 0,
        "HE Dom/Fest Diurna": t.heDominical ?? 0,
        "HE Dom/Fest Nocturna": t.heNoctDominical ?? 0,
        "Recargo Nocturno": t.recNocturno ?? 0,
        "Recargo Dom/Fest Diurno": t.recDominical ?? 0,
        "Recargo Dom/Fest Nocturno": t.recNoctDominical ?? 0,
      };
    });

    // Hoja Disponibilidades
    const dataDisponibilidades = mallaDisponibles.map((m) => ({
      Nombre: m.user.nombre,
      Cedula: m.user.cedula,
      Fecha: dateKey(m.fecha),
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
      const km = f.kmInicial != null && f.kmFinal != null && f.kmFinal > f.kmInicial
        ? f.kmFinal - f.kmInicial : 0;
      if (!foraneosPorTecnico[key]) {
        foraneosPorTecnico[key] = {
          Nombre: f.user.nombre,
          Cedula: f.user.cedula,
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