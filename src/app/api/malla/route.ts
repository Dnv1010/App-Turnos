export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const profile = await getUserProfile(user.email!);
    if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const mes = searchParams.get("mes");

    if (!userId || !mes) {
      return NextResponse.json({ error: "Parámetros userId y mes requeridos" }, { status: 400 });
    }

    const [year, month] = mes.split("-").map(Number);
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));

    if (profile.role === "TECNICO" && userId !== profile.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (profile.role === "COORDINADOR" || profile.role === "SUPPLY") {
      const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { zone: true, role: true, jobTitle: true },
      });
      if (profile.role === "SUPPLY") {
        // Supply puede ver/editar almacenistas de cualquier zona
        const ok = target && target.role === "TECNICO" && target.jobTitle === "ALMACENISTA";
        if (!ok) {
          return NextResponse.json({ error: "Solo puedes gestionar la malla de almacenistas" }, { status: 403 });
        }
      } else {
        // COORDINADOR solo ve su zona
        const ok = target && target.role === "TECNICO" && target.zone === profile.zone;
        if (!ok) {
          return NextResponse.json({ error: "Solo puedes ver la malla de operadores de tu zona" }, { status: 403 });
        }
      }
    }

    const malla = await prisma.shiftSchedule.findMany({
      where: {
        userId,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: "asc" },
    });

    const mallaConKey = (malla ?? []).map((m) => ({
      userId: m.userId,
      date: m.date.toISOString().split("T")[0],
      shiftCode: m.shiftCode,
      dayType: m.dayType ?? undefined,
      startTime: m.startTime ?? undefined,
      endTime: m.endTime ?? undefined,
    }));

    return NextResponse.json(mallaConKey);
  } catch (e) {
    console.error("[malla GET]", e);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const profile = await getUserProfile(user.email!);
    if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }
    const { userId, date, shiftCode, dayType, startTime, endTime } = body;

    if (!userId || !date) {
      return NextResponse.json({ error: "userId y date requeridos" }, { status: 400 });
    }
    const userIdStr = userId as string;

    const TIPOS_VALIDOS = ["TRABAJO", "DESCANSO", "DISPONIBLE", "DIA_FAMILIA", "INCAPACITADO", "VACACIONES", "MEDIO_CUMPLE"] as const;
    const tipoValido = typeof dayType === "string" && (TIPOS_VALIDOS as readonly string[]).includes(dayType)
      ? dayType as (typeof TIPOS_VALIDOS)[number]
      : undefined;

    let valorFinal: string | undefined = typeof shiftCode === "string" ? shiftCode : undefined;
    if (tipoValido === "DESCANSO") valorFinal = "descanso";
    else if (tipoValido === "DISPONIBLE") valorFinal = "disponible";
    else if (tipoValido === "TRABAJO" && startTime && endTime) valorFinal = `${startTime}-${endTime}`;
    else if (tipoValido === "DIA_FAMILIA") valorFinal = typeof shiftCode === "string" && shiftCode ? shiftCode : "Día de la familia";
    else if (tipoValido === "INCAPACITADO") valorFinal = typeof shiftCode === "string" && shiftCode ? shiftCode : "Incapacitado";
    else if (tipoValido === "VACACIONES") valorFinal = typeof shiftCode === "string" && shiftCode ? shiftCode : "Vacaciones";
    else if (tipoValido === "MEDIO_CUMPLE") valorFinal = typeof shiftCode === "string" && shiftCode ? shiftCode : "Medio día cumpleaños";
    if (valorFinal === undefined) valorFinal = "";

    if (profile.role === "TECNICO" && userIdStr !== profile.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (profile.role === "COORDINADOR" || profile.role === "SUPPLY") {
      const target = await prisma.user.findUnique({
        where: { id: userIdStr },
        select: { zone: true, role: true, jobTitle: true },
      });
      if (profile.role === "SUPPLY") {
        const ok = target && target.role === "TECNICO" && target.jobTitle === "ALMACENISTA";
        if (!ok) {
          return NextResponse.json({ error: "Solo puedes gestionar la malla de almacenistas" }, { status: 403 });
        }
      } else {
        const ok = target && target.role === "TECNICO" && target.zone === profile.zone;
        if (!ok) {
          return NextResponse.json({ error: "Solo puedes editar la malla de operadores de tu zona" }, { status: 403 });
        }
      }
    }

    const fechaStr = typeof date === "string" ? date : String(date);
    const [y, m, d] = fechaStr.split("-").map(Number);
    if (!y || !m || !d) {
      return NextResponse.json({ error: "date debe ser YYYY-MM-DD" }, { status: 400 });
    }
    const fechaDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

    const updateData: {
      shiftCode: string;
      dayType?: (typeof TIPOS_VALIDOS)[number];
      startTime?: string | null;
      endTime?: string | null;
    } = { shiftCode: valorFinal };
    if (tipoValido) updateData.dayType = tipoValido;
    if (startTime !== undefined) updateData.startTime = (startTime as string) || null;
    if (endTime !== undefined) updateData.endTime = (endTime as string) || null;

    await prisma.shiftSchedule.upsert({
      where: {
        userId_date: { userId: userIdStr, date: fechaDate },
      },
      update: updateData,
      create: {
        userId: userIdStr,
        date: fechaDate,
        shiftCode: updateData.shiftCode,
        dayType: updateData.dayType ?? "TRABAJO",
        startTime: updateData.startTime ?? undefined,
        endTime: updateData.endTime ?? undefined,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[malla POST]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error al guardar malla" }, { status: 500 });
  }
}
