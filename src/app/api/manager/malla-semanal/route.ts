/**
 * Devuelve la malla en un rango de fechas para todos los técnicos de
 * Bogotá y Costa (o filtrado por zona). Solo lectura, acceso MANAGER/ADMIN.
 *
 * GET /api/manager/malla-semanal?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&zona=BOGOTA|COSTA|ALL
 *
 * Para compatibilidad acepta también `inicio` (= desde, 7 días).
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

function parseYmd(s: string): { y: number; m: number; d: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

/** Días YYYY-MM-DD entre desde y hasta (inclusive). */
function diasEntre(desdeStr: string, hastaStr: string): string[] {
  const p1 = parseYmd(desdeStr);
  const p2 = parseYmd(hastaStr);
  if (!p1 || !p2) return [];
  const start = diaUtc(p1.y, p1.m, p1.d);
  const end = diaUtc(p2.y, p2.m, p2.d);
  if (end.getTime() < start.getTime()) return [];
  const out: string[] = [];
  // Tope de seguridad: 92 días (~3 meses).
  const MAX = 92;
  for (let i = 0; i < MAX; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    out.push(ymd(d));
    if (d.getTime() >= end.getTime()) break;
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const profile = await getUserProfile(user.email!);
    if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (profile.role !== "MANAGER" && profile.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo MANAGER/ADMIN" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    let desde = searchParams.get("desde");
    let hasta = searchParams.get("hasta");
    const zonaParam = searchParams.get("zona") ?? "ALL";

    // Compatibilidad con el formato semanal previo (?inicio=lunes).
    const inicioCompat = searchParams.get("inicio");
    if (!desde && inicioCompat) {
      desde = inicioCompat;
      const p = parseYmd(inicioCompat);
      if (p) {
        const finSemana = new Date(Date.UTC(p.y, p.m - 1, p.d + 6));
        hasta = ymd(finSemana);
      }
    }

    if (!desde || !hasta) {
      return NextResponse.json(
        { error: "Parámetros desde y hasta (YYYY-MM-DD) requeridos" },
        { status: 400 }
      );
    }

    const dias = diasEntre(desde, hasta);
    if (dias.length === 0) {
      return NextResponse.json(
        { error: "Rango de fechas inválido (hasta debe ser >= desde, máximo 92 días)" },
        { status: 400 }
      );
    }

    const pDesde = parseYmd(desde)!;
    const pHasta = parseYmd(hasta)!;
    // Margen ±1 día para tolerar shift_schedule.date desincronizado por timezone Postgres.
    const fechaInicioExp = diaUtc(pDesde.y, pDesde.m, pDesde.d - 1);
    const fechaFinExp = new Date(
      Date.UTC(pHasta.y, pHasta.m - 1, pHasta.d + 1, 23, 59, 59)
    );

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

    const [mallaRows, festivos] = await Promise.all([
      tecnicoIds.length
        ? prisma.shiftSchedule.findMany({
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
        : Promise.resolve([]),
      prisma.holiday.findMany({
        where: { date: { gte: fechaInicioExp, lte: fechaFinExp } },
        select: { date: true },
      }),
    ]);

    const festivosMap: Record<string, string> = {};
    for (const f of festivos) {
      festivosMap[ymd(f.date)] = "Festivo";
    }

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
      rango: {
        desde,
        hasta,
        dias,
        festivos: festivosMap,
      },
      tecnicos: tecnicosOut,
    });
  } catch (e) {
    console.error("[manager/malla-semanal]", e);
    const msg = e instanceof Error ? e.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
