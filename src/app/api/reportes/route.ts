import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const inicio = searchParams.get("inicio");
  const fin = searchParams.get("fin");
  const zona = searchParams.get("zona");
  const userId = searchParams.get("userId");

  if (!inicio || !fin) {
    return NextResponse.json({ error: "Parámetros inicio y fin requeridos" }, { status: 400 });
  }

  const whereUser: Record<string, unknown> = { isActive: true };
  if (zona && zona !== "ALL") whereUser.zona = zona;
  if (userId) whereUser.id = userId;

  if (session.user.role === "COORDINADOR") {
    whereUser.zona = session.user.zona;
  } else if (session.user.role === "TECNICO") {
    whereUser.id = session.user.userId;
  }

  const usuarios = await prisma.user.findMany({
    where: whereUser,
    include: {
      turnos: {
        where: { fecha: { gte: new Date(inicio), lte: new Date(fin) }, horaSalida: { not: null } },
        orderBy: { fecha: "asc" },
      },
      disponibilidades: {
        where: { fecha: { gte: new Date(inicio), lte: new Date(fin) } },
      },
    },
  });

  const detalle = usuarios.map((user) => {
    const totalHE = user.turnos.reduce((sum, t) => sum + t.heDiurna + t.heNocturna + t.heDominical + t.heNoctDominical, 0);
    const totalRecargos = user.turnos.reduce((sum, t) => sum + t.recNocturno + t.recDominical + t.recNoctDominical, 0);
    const totalOrdinarias = user.turnos.reduce((sum, t) => sum + t.horasOrdinarias, 0);
    const totalDisponibilidades = user.disponibilidades.reduce((sum, d) => sum + d.monto, 0);

    return {
      userId: user.id, nombre: user.nombre, zona: user.zona, role: user.role,
      totalTurnos: user.turnos.length,
      horasOrdinarias: Math.round(totalOrdinarias * 100) / 100,
      heDiurna: Math.round(user.turnos.reduce((s, t) => s + t.heDiurna, 0) * 100) / 100,
      heNocturna: Math.round(user.turnos.reduce((s, t) => s + t.heNocturna, 0) * 100) / 100,
      heDominical: Math.round(user.turnos.reduce((s, t) => s + t.heDominical, 0) * 100) / 100,
      heNoctDominical: Math.round(user.turnos.reduce((s, t) => s + t.heNoctDominical, 0) * 100) / 100,
      recNocturno: Math.round(user.turnos.reduce((s, t) => s + t.recNocturno, 0) * 100) / 100,
      recDominical: Math.round(user.turnos.reduce((s, t) => s + t.recDominical, 0) * 100) / 100,
      recNoctDominical: Math.round(user.turnos.reduce((s, t) => s + t.recNoctDominical, 0) * 100) / 100,
      totalHorasExtra: Math.round(totalHE * 100) / 100,
      totalRecargos: Math.round(totalRecargos * 100) / 100,
      totalDisponibilidades,
      turnos: user.turnos,
    };
  });

  const resumen = {
    totalTecnicos: detalle.length,
    totalHorasExtra: Math.round(detalle.reduce((s, d) => s + d.totalHorasExtra, 0) * 100) / 100,
    totalRecargos: Math.round(detalle.reduce((s, d) => s + d.totalRecargos, 0) * 100) / 100,
    totalHorasOrdinarias: Math.round(detalle.reduce((s, d) => s + d.horasOrdinarias, 0) * 100) / 100,
    totalDisponibilidades: detalle.reduce((s, d) => s + d.totalDisponibilidades, 0),
  };

  const alertas = detalle
    .filter((d) => d.totalHorasExtra > 40)
    .map((d) => ({ userId: d.userId, nombre: d.nombre, mensaje: `${d.nombre} acumula ${d.totalHorasExtra}h extras en el período` }));

  return NextResponse.json({ detalle, resumen, alertas, disponibilidades: detalle.map((d) => ({ userId: d.userId, nombre: d.nombre, total: d.totalDisponibilidades })) });
}
