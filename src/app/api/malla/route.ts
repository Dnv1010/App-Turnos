import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { startOfMonth, endOfMonth } from "date-fns";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const mes = searchParams.get("mes"); // yyyy-MM

  if (!userId || !mes) {
    return NextResponse.json({ error: "Parámetros userId y mes requeridos" }, { status: 400 });
  }

  const [year, month] = mes.split("-").map(Number);
  const start = startOfMonth(new Date(year, month - 1));
  const end = endOfMonth(new Date(year, month - 1));

  if (session.user.role === "TECNICO" && userId !== session.user.userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  if (session.user.role === "COORDINADOR") {
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { zona: true, role: true } });
    if (!target || target.role !== "TECNICO" || target.zona !== session.user.zona) {
      return NextResponse.json({ error: "Solo puedes ver la malla de técnicos de tu zona" }, { status: 403 });
    }
  }

  const malla = await prisma.mallaTurno.findMany({
    where: {
      userId,
      fecha: { gte: start, lte: end },
    },
    orderBy: { fecha: "asc" },
  });

  return NextResponse.json(malla);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { userId, fecha, valor } = body;

  if (!userId || !fecha) {
    return NextResponse.json({ error: "userId y fecha requeridos" }, { status: 400 });
  }

  if (session.user.role === "TECNICO" && userId !== session.user.userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  if (session.user.role === "COORDINADOR") {
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { zona: true, role: true } });
    if (!target || target.role !== "TECNICO" || target.zona !== session.user.zona) {
      return NextResponse.json({ error: "Solo puedes editar la malla de técnicos de tu zona" }, { status: 403 });
    }
  }

  const fechaDate = new Date(fecha);
  fechaDate.setHours(0, 0, 0, 0);

  await prisma.mallaTurno.upsert({
    where: {
      userId_fecha: { userId, fecha: fechaDate },
    },
    update: { valor: valor ?? "" },
    create: { userId, fecha: fechaDate, valor: valor ?? "" },
  });

  return NextResponse.json({ ok: true });
}
