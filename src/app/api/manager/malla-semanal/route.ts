/**
 * Devuelve la malla de una semana completa para todos los técnicos
 * de una zona (o todas). Solo lectura, acceso MANAGER/ADMIN.
 *
 * GET /api/manager/malla-semanal?inicio=YYYY-MM-DD&zona=BOGOTA|COSTA|ALL
 *
 * `inicio` debe ser un lunes. La semana abarca lunes a domingo.
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import type { Zone } from "@prisma/client";

const ZONAS_PERMITIDAS: Zone[] = ["BOGOTA", "COSTA"];

function diaUtc(year: number, month1Based: number, day: number): Date {
  return new Date(Date.UTC(year, month1Based - 1, day, 0, 0, 0));
}

function ymd(d: Date): string {
  return d.toISOString().split("T")[0];
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const profile = await getUserProfile(user.email!);
  if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  if (profile.role !== "MANAGER" && profile.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo MANAGER/ADMIN" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const inicio = searchParams.get("inicio");
  const zonaParam = searchParams.get("zona") ?? "ALL";

  if (!inicio || !/^\d{4}-\d{2}-\d{2}$/.test(inicio)) {
    return NextResponse.json({ error: "Parámetro inicio (YYYY-MM-DD) requerido" }, { status: 400 });
  }

  const [yi, mi, di] = inicio.split("-").map(Number);
  const fechaInicio = diaUtc(yi, mi, di);
  // Domingo = inicio + 6 días
  const fechaFin = diaUtc(yi, mi, di + 6);
  // Margen ±1 día para tolerar shift_schedule.date desincronizado por timezone Postgres
  const fechaInicioExp = diaUtc(yi, mi, di - 1);
  const fechaFinExp = new Date(Date.UTC(yi, mi - 1, di + 7, 23, 59, 59));

  const zonaFiltro: Zone[] =
    zonaParam === "ALL"
      ? ZONAS_PERMITIDAS
      : ZONAS_PERMITIDAS.includes(zonaParam as Zone)
        ? [zonaParam as Zone]
        : ZONAS_PERMITIDAS;

  const tecnicos = await prisma.user.findMany({
    where: {
      role: "TECNICO",
      isActive: true,
      zone: { in: zonaFiltro },
    },
    select: {
      id: true,
      fullName: true,
      documentNumber: true,
      zone: true,
      jobTitle: true,
    },
    orderBy: [{ zone: "asc" }, { fullName: "asc" }],
  });

  const tecnicoIds = tecnicos.map((t) => t.id);

  const mallaRows = tecnicoIds.length
    ? await prisma.shiftSchedule.findMany({
        where: {
          userId: { in: tecnicoIds },
          date: { gte: fechaInicioExp, lte: fechaFinExp },
        },
        select: {
          userId: true,
          date: true,
          shiftCode: true,
          dayType: true,
          startTime: true,
          endTime: true,
        },
      })
    : [];

  // Festivos de la semana para destacar columnas
  const festivos = await prisma.holiday.findMany({
    where: { date: { gte: fechaInicioExp, lte: fechaFinExp } },
    select: { date: true, name: true },
  });
  const festivosMap: Record<string, string> = {};
  for (const f of festivos) {
    festivosMap[ymd(f.date)] = f.name;
  }

  // Indexar malla por userId + YMD
  const mallaPorUserDia = new Map<
    string,
    { shiftCode: string; dayType: string | null; startTime: string | null; endTime: string | null }
  >();
  for (const m of mallaRows) {
    const key = `${m.userId}|${ymd(m.date)}`;
    mallaPorUserDia.set(key, {
      shiftCode: m.shiftCode,
      dayType: m.dayType,
      startTime: m.startTime,
      endTime: m.endTime,
    });
  }

  // Construir días de la semana (lunes a domingo)
  const dias: string[] = [];
  for (let i = 0; i < 7; i++) {
    dias.push(ymd(diaUtc(yi, mi, di + i)));
  }

  const tecnicosOut = tecnicos.map((t) => {
    const malla: Record<string, { shiftCode: string; dayType: string | null }> = {};
    for (const dia of dias) {
      const m = mallaPorUserDia.get(`${t.id}|${dia}`);
      if (m) {
        malla[dia] = { shiftCode: m.shiftCode, dayType: m.dayType };
      }
    }
    return {
      id: t.id,
      fullName: t.fullName,
      documentNumber: t.documentNumber,
      zone: t.zone,
      jobTitle: t.jobTitle,
      malla,
    };
  });

  return NextResponse.json({
    semana: {
      inicio: ymd(fechaInicio),
      fin: ymd(fechaFin),
      dias,
      festivos: festivosMap,
    },
    tecnicos: tecnicosOut,
  });
}
