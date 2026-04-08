export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const profile = await getUserProfile(user.email!);
    if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    const uid = profile.id;

    // Fecha Colombia (UTC-5)
    const ahora = new Date();
    const colombiaTime = new Date(ahora.getTime() - 5 * 60 * 60 * 1000);
    const fecha = new Date(
      Date.UTC(colombiaTime.getUTCFullYear(), colombiaTime.getUTCMonth(), colombiaTime.getUTCDate())
    );

    const malla = await prisma.mallaTurno.findUnique({
      where: { userId_fecha: { userId: uid, fecha } },
    });

    if (!malla) {
      return NextResponse.json({ bloqueado: false });
    }

    const valorMalla = (malla.valor ?? "").toLowerCase().trim();
    const estadosBloqueantes = [
      "descanso",
      "vacacion",
      "vacaciones",
      "dia de la familia",
      "día de la familia",
      "incapacitado",
      "incapacidad",
      "semana santa",
      "keynote",
    ];

    const bloqueado = estadosBloqueantes.some((estado) => valorMalla.includes(estado));
    const fechaStr = fecha.toISOString().split("T")[0].split("-").reverse().join("/");

    return NextResponse.json({
      bloqueado,
      estado: malla.valor,
      fecha: fechaStr,
    });
  } catch (error) {
    console.error("[malla/verificar-hoy]", error);
    return NextResponse.json({ bloqueado: false });
  }
}
