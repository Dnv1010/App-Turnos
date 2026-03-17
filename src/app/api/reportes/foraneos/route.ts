import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const TARIFA_POR_KM = 1100;

function dateKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

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
    if (zona && zona !== "ALL") whereUser.zona = zona;
    if (session.user.role === "COORDINADOR") {
      whereUser.zona = session.user.zona;
    } else if (session.user.role === "TECNICO") {
      whereUser.id = session.user.userId;
    }

    const usuarios = await prisma.user.findMany({
      where: whereUser as { isActive: boolean; id?: string; role?: string; zona?: string },
      select: { id: true },
    });
    const userIds = usuarios.map((u) => u.id);
    if (userIds.length === 0) return NextResponse.json([]);

    const fotos = await prisma.fotoRegistro.findMany({
      where: {
        tipo: "FORANEO",
        createdAt: { gte: fechaInicio, lte: fechaFin },
        userId: { in: userIds },
      },
      include: { user: { select: { id: true, nombre: true, cedula: true } } },
    });

    const byUser = new Map<
      string,
      { nombre: string; cedula: string; registros: { fecha: string; km: number }[] }
    >();
    for (const f of fotos) {
      const km =
        f.kmInicial != null && f.kmFinal != null && f.kmFinal > f.kmInicial
          ? f.kmFinal - f.kmInicial
          : 0;
      const fecha = dateKey(f.createdAt);
      if (!byUser.has(f.userId)) {
        byUser.set(f.userId, {
          nombre: f.user.nombre,
          cedula: f.user.cedula,
          registros: [],
        });
      }
      const entry = byUser.get(f.userId)!;
      entry.registros.push({ fecha, km });
    }

    const lista = Array.from(byUser.entries()).map(([uid, entry]) => {
      const cantidadForaneos = entry.registros.length;
      const totalKm = Math.round(entry.registros.reduce((s, r) => s + r.km, 0) * 100) / 100;
      const totalPagar = Math.round(totalKm * TARIFA_POR_KM);
      return {
        userId: uid,
        nombre: entry.nombre,
        cedula: entry.cedula,
        cantidadForaneos,
        totalKm,
        totalPagar,
        fechas: entry.registros.map((r) => r.fecha),
      };
    });

    return NextResponse.json(lista);
  } catch (e) {
    console.error("[reportes/foraneos]", e);
    return NextResponse.json([]);
  }
}
