export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import type { Prisma } from "@prisma/client";

const TARIFA_POR_KM = 1100;

function dateKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

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
    const fechaInicio = new Date(Date.UTC(yi, mi - 1, di, 0, 0, 0));
    const fechaFin = new Date(Date.UTC(yf, mf - 1, df, 23, 59, 59));

    const whereUser: Record<string, unknown> = { isActive: true };
    if (userId) whereUser.id = userId;
    if (rol && rol !== "ALL") whereUser.role = rol;
    if (zona && zona !== "ALL") whereUser.zone = zona;
    if (profile.role === "COORDINADOR") {
      whereUser.zone = profile.zone;
    } else if (profile.role === "TECNICO") {
      whereUser.id = profile.id;
    }

    const usuarios = await prisma.user.findMany({
      where: whereUser as unknown as Prisma.UserWhereInput,
      select: { id: true },
    });
    const userIds = usuarios.map((u) => u.id);
    if (userIds.length === 0) return NextResponse.json([]);

    const fotos = await prisma.tripRecord.findMany({
      where: {
        type: "FORANEO",
        approvalStatus: "APROBADA",
        createdAt: { gte: fechaInicio, lte: fechaFin },
        userId: { in: userIds },
      },
      include: { user: { select: { id: true, fullName: true, documentNumber: true } } },
    });

    const byUser = new Map<
      string,
      { fullName: string; documentNumber: string; registros: { date: string; km: number }[] }
    >();
    for (const f of fotos) {
      const km =
        f.startKm != null && f.endKm != null && f.endKm > f.startKm
          ? f.endKm - f.startKm
          : 0;
      const date = dateKey(f.createdAt);
      if (!byUser.has(f.userId)) {
        byUser.set(f.userId, {
          fullName: f.user.fullName,
          documentNumber: f.user.documentNumber,
          registros: [],
        });
      }
      const entry = byUser.get(f.userId)!;
      entry.registros.push({ date, km });
    }

    const lista = Array.from(byUser.entries()).map(([uid, entry]) => {
      const cantidadForaneos = entry.registros.length;
      const totalKm = Math.round(entry.registros.reduce((s, r) => s + r.km, 0) * 100) / 100;
      const totalPagar = Math.round(totalKm * TARIFA_POR_KM);
      return {
        userId: uid,
        fullName: entry.fullName,
        documentNumber: entry.documentNumber,
        cantidadForaneos,
        totalKm,
        totalPagar,
        dates: entry.registros.map((r) => r.date),
      };
    });

    return NextResponse.json(lista);
  } catch (e) {
    console.error("[reportes/foraneos]", e);
    return NextResponse.json([]);
  }
}
