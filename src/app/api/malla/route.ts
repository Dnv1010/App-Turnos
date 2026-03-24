import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { appendRow, deleteRowByValues } from "@/lib/google-sheets";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const mes = searchParams.get("mes");

    if (!userId || !mes) {
      return NextResponse.json({ error: "Parámetros userId y mes requeridos" }, { status: 400 });
    }

    const [year, month] = mes.split("-").map(Number);
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));

    if (session.user.role === "TECNICO" && userId !== session.user.userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (session.user.role === "COORDINADOR" || session.user.role === "SUPPLY") {
      const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { zona: true, role: true, cargo: true },
      });
      const ok =
        target &&
        target.role === "TECNICO" &&
        target.zona === session.user.zona &&
        (session.user.role === "COORDINADOR" || target.cargo === "ALMACENISTA");
      if (!ok) {
        return NextResponse.json({ error: "Solo puedes ver la malla de operadores de tu zona" }, { status: 403 });
      }
    }

    const malla = await prisma.mallaTurno.findMany({
      where: {
        userId,
        fecha: { gte: startDate, lte: endDate },
      },
      orderBy: { fecha: "asc" },
    });

    const mallaConKey = (malla ?? []).map((m) => ({
      userId: m.userId,
      fecha: m.fecha.toISOString().split("T")[0],
      valor: m.valor,
      tipo: m.tipo ?? undefined,
      horaInicio: m.horaInicio ?? undefined,
      horaFin: m.horaFin ?? undefined,
    }));

    return NextResponse.json(mallaConKey);
  } catch (e) {
    console.error("[malla GET]", e);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }
    const { userId, fecha, valor, tipo, horaInicio, horaFin } = body;

    if (!userId || !fecha) {
      return NextResponse.json({ error: "userId y fecha requeridos" }, { status: 400 });
    }

    const TIPOS_VALIDOS = ["TRABAJO", "DESCANSO", "DISPONIBLE", "DIA_FAMILIA", "INCAPACITADO", "VACACIONES", "MEDIO_CUMPLE"] as const;
    const tipoValido = typeof tipo === "string" && (TIPOS_VALIDOS as readonly string[]).includes(tipo)
      ? tipo as (typeof TIPOS_VALIDOS)[number]
      : undefined;

    let valorFinal = valor;
    if (tipoValido === "DESCANSO") valorFinal = "descanso";
    else if (tipoValido === "DISPONIBLE") valorFinal = "disponible";
    else if (tipoValido === "TRABAJO" && horaInicio && horaFin) valorFinal = `${horaInicio}-${horaFin}`;
    else if (tipoValido === "DIA_FAMILIA") valorFinal = typeof valor === "string" && valor ? valor : "Día de la familia";
    else if (tipoValido === "INCAPACITADO") valorFinal = typeof valor === "string" && valor ? valor : "Incapacitado";
    else if (tipoValido === "VACACIONES") valorFinal = typeof valor === "string" && valor ? valor : "Vacaciones";
    else if (tipoValido === "MEDIO_CUMPLE") valorFinal = typeof valor === "string" && valor ? valor : "Medio día cumpleaños";
    if (valorFinal === undefined) valorFinal = (valor ?? "") as string;

    if (session.user.role === "TECNICO" && userId !== session.user.userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (session.user.role === "COORDINADOR" || session.user.role === "SUPPLY") {
      const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { zona: true, role: true, cargo: true },
      });
      const ok =
        target &&
        target.role === "TECNICO" &&
        target.zona === session.user.zona &&
        (session.user.role === "COORDINADOR" || target.cargo === "ALMACENISTA");
      if (!ok) {
        return NextResponse.json({ error: "Solo puedes editar la malla de operadores de tu zona" }, { status: 403 });
      }
    }

    const fechaStr = typeof fecha === "string" ? fecha : String(fecha);
    const [y, m, d] = fechaStr.split("-").map(Number);
    if (!y || !m || !d) {
      return NextResponse.json({ error: "fecha debe ser YYYY-MM-DD" }, { status: 400 });
    }
    const fechaDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { nombre: true, cedula: true },
    });

    const existing = await prisma.mallaTurno.findUnique({
      where: { userId_fecha: { userId, fecha: fechaDate } },
      select: { tipo: true },
    });
    const wasDisponible = existing?.tipo === "DISPONIBLE";

    if (user) {
      if (wasDisponible && tipoValido !== "DISPONIBLE") {
        // Era DISPONIBLE y cambió a otro tipo → borrar de Sheets
        deleteRowByValues("Disponibilidades", [
          { index: 0, value: user.nombre },
          { index: 2, value: fechaStr },
        ]).catch(console.error);
      }
      if (tipoValido === "DISPONIBLE" && !wasDisponible) {
        // Era otro tipo y cambió a DISPONIBLE → agregar a Sheets
        appendRow("Disponibilidades", [
          user.nombre,
          user.cedula ?? "",
          fechaStr,
          80000,
        ]).catch(console.error);
      }
      // Si ya era DISPONIBLE y sigue siendo DISPONIBLE → no hacer nada
    }

    const updateData: {
      valor: string;
      tipo?: (typeof TIPOS_VALIDOS)[number];
      horaInicio?: string | null;
      horaFin?: string | null;
    } = { valor: valorFinal ?? "" };
    if (tipoValido) updateData.tipo = tipoValido;
    if (horaInicio !== undefined) updateData.horaInicio = horaInicio || null;
    if (horaFin !== undefined) updateData.horaFin = horaFin || null;

    await prisma.mallaTurno.upsert({
      where: {
        userId_fecha: { userId, fecha: fechaDate },
      },
      update: updateData,
      create: {
        userId,
        fecha: fechaDate,
        valor: updateData.valor,
        tipo: updateData.tipo ?? "TRABAJO",
        horaInicio: updateData.horaInicio ?? undefined,
        horaFin: updateData.horaFin ?? undefined,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[malla POST]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error al guardar malla" }, { status: 500 });
  }
}