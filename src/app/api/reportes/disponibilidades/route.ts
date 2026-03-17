import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const VALOR_POR_DIA = 80000;

export async function GET(req: NextRequest) {
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

  const mallaDisponibles = await prisma.mallaTurno.findMany({
    where: {
      tipo: "DISPONIBLE",
      fecha: { gte: fechaInicio, lte: fechaFin },
      userId: { in: userIds },
    },
    include: { user: { select: { id: true, nombre: true, cedula: true } } },
    orderBy: [{ userId: "asc" }, { fecha: "asc" }],
  });

  const lista = mallaDisponibles.map((m) => ({
    nombre: m.user.nombre,
    cedula: m.user.cedula,
    fecha: m.fecha.toISOString().split("T")[0],
    valor: VALOR_POR_DIA,
  }));

  return NextResponse.json(lista);
}
