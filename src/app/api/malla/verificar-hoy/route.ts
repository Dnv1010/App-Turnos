export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const uid = session.user.userId;

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
