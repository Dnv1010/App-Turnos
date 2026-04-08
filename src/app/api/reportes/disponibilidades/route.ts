export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { valorDisponibilidadMallaPorRol } from "@/lib/reporteDisponibilidadValor";

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
    const rol = searchParams.get("rol");
    const zona = searchParams.get("zona");

    if (!desde || !hasta) {
      return NextResponse.json({ error: "Parámetros desde y hasta requeridos (YYYY-MM-DD)" }, { status: 400 });
    }

    const [yi, mi, di] = desde.split("-").map(Number);
    const [yf, mf, df] = hasta.split("-").map(Number);
    const fechaInicio = new Date(Date.UTC(yi!, mi! - 1, di!, 0, 0, 0));
    const fechaFin = new Date(Date.UTC(yf!, mf! - 1, df!, 23, 59, 59));

    const whereUser: Record<string, unknown> = { isActive: true };
    if (userId) whereUser.id = userId;
    if (rol && rol !== "ALL") whereUser.role = rol;
    if (profile.role === "TECNICO") {
      whereUser.id = profile.id;
    } else if (profile.role === "COORDINADOR") {
      whereUser.zona = profile.zona;
    } else if (profile.role === "SUPPLY") {
      if (zona && zona !== "ALL") whereUser.zona = zona;
    } else if (zona && zona !== "ALL") {
      whereUser.zona = zona;
    }

    const usuarios = await prisma.user.findMany({
      where: whereUser as { isActive: boolean; id?: string; role?: string; zona?: string },
      select: { id: true },
    });
    const userIds = usuarios.map((u) => u.id);
    if (userIds.length === 0) return NextResponse.json([]);

    const mallaDisponibles = await prisma.mallaTurno.findMany({
      where: {
        tipo: "DISPONIBLE",
        fecha: { gte: fechaInicio, lte: fechaFin },
        userId: { in: userIds },
      },
      // FIX: incluir role del user para calcular valor correcto por rol
      include: { user: { select: { id: true, nombre: true, cedula: true, role: true } } },
      orderBy: [{ userId: "asc" }, { fecha: "asc" }],
    });

    const lista = mallaDisponibles.map((m) => ({
      nombre: m.user.nombre,
      cedula: m.user.cedula,
      fecha: m.fecha.toISOString().split("T")[0],
      // FIX: calcular valor según rol — TECNICO: 80.000, COORDINADOR/COORDINADOR_INTERIOR: 110.000
      valor: valorDisponibilidadMallaPorRol(m.user.role),
    }));

    return NextResponse.json(lista);
  } catch (e) {
    console.error("[reportes/disponibilidades]", e);
    return NextResponse.json([]);
  }
}