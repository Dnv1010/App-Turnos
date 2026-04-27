export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";

function dateKey(d: Date): string {
  return d.toISOString().split("T")[0];
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
    const { userId, userIds, mes } = body as { userId?: string; userIds?: string[]; mes?: string };

    // Acepta userIds[] (multi) o userId (single, retrocompat)
    const targetIds: string[] = Array.isArray(userIds) && userIds.length > 0
      ? userIds.filter((x): x is string => typeof x === "string" && x.length > 0)
      : (typeof userId === "string" && userId ? [userId] : []);

    if (targetIds.length === 0 || !mes) {
      return NextResponse.json({ error: "userId/userIds y mes (yyyy-MM) requeridos" }, { status: 400 });
    }

    if (profile.role === "TECNICO") {
      if (targetIds.length !== 1 || targetIds[0] !== profile.id) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
    }
    if (profile.role === "COORDINADOR" || profile.role === "SUPPLY") {
      const targets = await prisma.user.findMany({
        where: { id: { in: targetIds } },
        select: { id: true, zona: true, role: true, cargo: true },
      });
      const invalido =
        targets.length !== targetIds.length ||
        targets.some((t) => {
          if (t.role !== "TECNICO" || t.zona !== profile.zona) return true;
          if (profile.role === "SUPPLY" && t.cargo !== "ALMACENISTA") return true;
          return false;
        });
      if (invalido) {
        return NextResponse.json({ error: "Solo puedes precargar malla de operadores de tu zona" }, { status: 403 });
      }
    }

    const [year, month] = String(mes).split("-").map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59));
    const festivos = await prisma.festivo.findMany({
      where: { fecha: { gte: start, lte: end } },
    });
    const festivoSet = new Set(festivos.map((f) => dateKey(f.fecha)));

    let count = 0;
    let usuariosProcesados = 0;
    for (const uid of targetIds) {
      const current = new Date(start);
      while (current <= end) {
        const key = dateKey(current);
        const dayOfWeek = current.getUTCDay();
        const isSunday = dayOfWeek === 0;
        const isSaturday = dayOfWeek === 6;
        const isFestivo = festivoSet.has(key);

        let tipo: "TRABAJO" | "DESCANSO" = "TRABAJO";
        let valor = "08:00-17:00";
        let horaInicio = "08:00";
        let horaFin = "17:00";

        if (isSunday || isFestivo) {
          tipo = "DESCANSO";
          valor = "descanso";
          horaInicio = "";
          horaFin = "";
        } else if (isSaturday) {
          valor = "08:00-12:00";
          horaInicio = "08:00";
          horaFin = "12:00";
        }

        await prisma.mallaTurno.upsert({
          where: { userId_fecha: { userId: uid, fecha: new Date(current.getTime()) } },
          update: { valor, tipo, horaInicio: horaInicio || null, horaFin: horaFin || null },
          create: { userId: uid, fecha: new Date(current.getTime()), valor, tipo, horaInicio: horaInicio || null, horaFin: horaFin || null },
        });
        count++;
        current.setUTCDate(current.getUTCDate() + 1);
      }
      usuariosProcesados++;
    }

    return NextResponse.json({ ok: true, registros: count, usuarios: usuariosProcesados });
  } catch (e) {
    console.error("[malla precarga]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error al precargar malla" }, { status: 500 });
  }
}
