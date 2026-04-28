export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { prisma } from "@/lib/prisma";
import { rewriteSheet } from "@/lib/google-sheets";

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

export async function POST() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const profile = await getUserProfile(user.email!);
    if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (profile.role !== "ADMIN" && profile.role !== "COORDINADOR") {
      return NextResponse.json({ error: "Solo ADMIN o COORDINADOR pueden sincronizar Sheets" }, { status: 403 });
    }

    const tecnicos = await prisma.user.findMany({
      where: { role: "TECNICO", isActive: true },
      select: { id: true },
    });
    const userIds = tecnicos.map((u) => u.id);
    if (userIds.length === 0) {
      await Promise.all([
        rewriteSheet("Resumen", ["Nombre", "Cédula", "Total Turnos", "Total Horas Trabajadas", "Horas Ordinarias", "HE Diurna", "HE Nocturna", "HE Dom/Fest Diurna", "HE Dom/Fest Nocturna", "Recargo Nocturno", "Recargo Dom/Fest Diurno", "Recargo Dom/Fest Nocturno", "Total HE", "Total Recargos"], []),
        rewriteSheet("Turnos", ["Nombre", "Cédula", "Fecha", "Día", "Entrada", "Salida", "Total Horas", "Horas Ordinarias", "HE Diurna", "HE Nocturna", "HE Dom/Fest Diurna", "HE Dom/Fest Nocturna", "Recargo Nocturno", "Recargo Dom/Fest Diurno", "Recargo Dom/Fest Nocturno"], []),
        rewriteSheet("Disponibilidades", ["Nombre", "Cédula", "Fecha", "Valor"], []),
        rewriteSheet("Foraneos", ["Nombre", "Cédula", "Fecha", "Cantidad Foráneos", "Total Km", "Total a Pagar"], []),
      ]);
      return NextResponse.json({ ok: true, message: "Sheets vacíos (sin operadores)" });
    }

    const [turnos, mallaDisponibles, fotosForaneos] = await Promise.all([
      prisma.shift.findMany({
        where: {
          userId: { in: userIds },
          clockOutAt: { not: null },
        },
        include: { user: { select: { fullName: true, documentNumber: true } } },
        orderBy: [{ date: "asc" }, { clockInAt: "asc" }],
      }),
      prisma.shiftSchedule.findMany({
        where: {
          dayType: "DISPONIBLE",
          userId: { in: userIds },
        },
        include: { user: { select: { fullName: true, documentNumber: true } } },
        orderBy: [{ userId: "asc" }, { date: "asc" }],
      }),
      prisma.tripRecord.findMany({
        where: {
          type: "FORANEO",
          approvalStatus: "APROBADA",
          userId: { in: userIds },
          endKm: { not: null },
        },
        include: { user: { select: { fullName: true, documentNumber: true } } },
      }),
    ]);

    // Resumen — una fila por técnico
    const resumenMap: Record<
      string,
      {
        nombre: string;
        cedula: string | null;
        totalTurnos: number;
        totalHoras: number;
        horasOrd: number;
        heDiurna: number;
        heNocturna: number;
        heDomD: number;
        heDomN: number;
        recNoc: number;
        recDomD: number;
        recDomN: number;
      }
    > = {};
    turnos.forEach((t) => {
      const key = t.userId;
      const totalHoras = t.clockOutAt
        ? Math.round(((t.clockOutAt.getTime() - t.clockInAt.getTime()) / (1000 * 60 * 60)) * 100) / 100
        : 0;
      if (!resumenMap[key]) {
        resumenMap[key] = {
          nombre: t.user.fullName,
          cedula: t.user.documentNumber,
          totalTurnos: 0,
          totalHoras: 0,
          horasOrd: 0,
          heDiurna: 0,
          heNocturna: 0,
          heDomD: 0,
          heDomN: 0,
          recNoc: 0,
          recDomD: 0,
          recDomN: 0,
        };
      }
      const r = resumenMap[key];
      r.totalTurnos += 1;
      r.totalHoras += totalHoras;
      r.horasOrd += Math.max(0, t.regularHours ?? 0);
      r.heDiurna += t.daytimeOvertimeHours ?? 0;
      r.heNocturna += t.nighttimeOvertimeHours ?? 0;
      r.heDomD += t.sundayOvertimeHours ?? 0;
      r.heDomN += t.nightSundayOvertimeHours ?? 0;
      r.recNoc += t.nightSurchargeHours ?? 0;
      r.recDomD += t.sundaySurchargeHours ?? 0;
      r.recDomN += t.nightSundaySurchargeHours ?? 0;
    });

    const resumenHeaders = [
      "Nombre", "Cédula", "Total Turnos", "Total Horas Trabajadas", "Horas Ordinarias",
      "HE Diurna", "HE Nocturna", "HE Dom/Fest Diurna", "HE Dom/Fest Nocturna",
      "Recargo Nocturno", "Recargo Dom/Fest Diurno", "Recargo Dom/Fest Nocturno",
      "Total HE", "Total Recargos",
    ];
    const resumenRows = Object.values(resumenMap).map((r) => [
      r.nombre, r.cedula ?? "", r.totalTurnos,
      Math.round(r.totalHoras * 100) / 100,
      Math.round(r.horasOrd * 100) / 100,
      r.heDiurna, r.heNocturna, r.heDomD, r.heDomN,
      r.recNoc, r.recDomD, r.recDomN,
      Math.round((r.heDiurna + r.heNocturna + r.heDomD + r.heDomN) * 100) / 100,
      Math.round((r.recNoc + r.recDomD + r.recDomN) * 100) / 100,
    ]);

    // Turnos — detalle con columna Día
    const turnosHeaders = [
      "Nombre", "Cédula", "Fecha", "Día", "Entrada", "Salida", "Total Horas",
      "Horas Ordinarias", "HE Diurna", "HE Nocturna", "HE Dom/Fest Diurna",
      "HE Dom/Fest Nocturna", "Recargo Nocturno", "Recargo Dom/Fest Diurno", "Recargo Dom/Fest Nocturno",
    ];
    const turnosRows = turnos.map((t) => {
      const totalHoras = t.clockOutAt
        ? Math.round(((t.clockOutAt.getTime() - t.clockInAt.getTime()) / (1000 * 60 * 60)) * 100) / 100
        : 0;
      return [
        t.user.fullName,
        t.user.documentNumber ?? "",
        dateKey(t.date),
        diaSemana(t.date),
        timeColombia(t.clockInAt),
        t.clockOutAt ? timeColombia(t.clockOutAt) : "",
        totalHoras,
        Math.max(0, t.regularHours ?? 0),
        t.daytimeOvertimeHours ?? 0,
        t.nighttimeOvertimeHours ?? 0,
        t.sundayOvertimeHours ?? 0,
        t.nightSundayOvertimeHours ?? 0,
        t.nightSurchargeHours ?? 0,
        t.sundaySurchargeHours ?? 0,
        t.nightSundaySurchargeHours ?? 0,
      ];
    });

    // Disponibilidades
    const dispHeaders = ["Nombre", "Cédula", "Fecha", "Valor"];
    const dispRows = mallaDisponibles.map((m) => [
      m.user.fullName, m.user.documentNumber ?? "", dateKey(m.date), 80000,
    ]);

    // Foráneos — agrupados por técnico y fecha
    const foraneosMap: Record<
      string,
      { nombre: string; cedula: string | null; cantidad: number; km: number; totalPagar: number }
    > = {};
    fotosForaneos.forEach((f) => {
      const km = f.startKm != null && f.endKm != null && f.endKm > f.startKm ? f.endKm - f.startKm : 0;
      const fechaStr = dateKey(f.createdAt);
      const key = `${f.userId}_${fechaStr}`;
      if (!foraneosMap[key]) {
        foraneosMap[key] = { nombre: f.user.fullName, cedula: f.user.documentNumber, cantidad: 0, km: 0, totalPagar: 0 };
      }
      foraneosMap[key].cantidad += 1;
      foraneosMap[key].km += km;
      foraneosMap[key].totalPagar += Math.round(km * 1100);
    });
    const foraneosHeaders = ["Nombre", "Cédula", "Fecha", "Cantidad Foráneos", "Total Km", "Total a Pagar"];
    const foraneosRows = Object.entries(foraneosMap).map(([key, v]) => {
      const fecha = key.split("_")[1] ?? "";
      return [v.nombre, v.cedula ?? "", fecha, v.cantidad, Math.round(v.km * 100) / 100, v.totalPagar];
    });

    await Promise.all([
      rewriteSheet("Resumen", resumenHeaders, resumenRows),
      rewriteSheet("Turnos", turnosHeaders, turnosRows),
      rewriteSheet("Disponibilidades", dispHeaders, dispRows),
      rewriteSheet("Foraneos", foraneosHeaders, foraneosRows),
    ]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[sheets/sync]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al sincronizar Sheets" },
      { status: 500 }
    );
  }
}
