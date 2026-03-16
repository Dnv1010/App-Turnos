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

  const fechaInicio = new Date(inicio);
  const fechaFin = new Date(fin);

  const usuarios = await prisma.user.findMany({
    where: whereUser,
    select: {
      id: true, nombre: true, cedula: true, email: true, zona: true, role: true,
      turnos: {
        where: { fecha: { gte: fechaInicio, lte: fechaFin }, horaSalida: { not: null } },
        orderBy: { fecha: "asc" },
      },
      disponibilidades: {
        where: { fecha: { gte: fechaInicio, lte: fechaFin } },
      },
      fotoRegistros: {
        where: { createdAt: { gte: fechaInicio, lte: fechaFin } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const detalle = usuarios.map((user) => {
    const totalHE = user.turnos.reduce((sum, t) => sum + t.heDiurna + t.heNocturna + t.heDominical + t.heNoctDominical, 0);
    const totalRecargos = user.turnos.reduce((sum, t) => sum + t.recNocturno + t.recDominical + t.recNoctDominical, 0);
    const totalOrdinarias = user.turnos.reduce((sum, t) => sum + t.horasOrdinarias, 0);
    const totalDisponibilidades = user.disponibilidades.reduce((sum, d) => sum + d.monto, 0);

    const fotosForaneo = user.fotoRegistros.filter((f) => f.tipo === "FORANEO");
    const totalKmRecorridos = fotosForaneo.reduce((sum, f) => {
      if (f.kmInicial != null && f.kmFinal != null && f.kmFinal > f.kmInicial) {
        return sum + (f.kmFinal - f.kmInicial);
      }
      return sum;
    }, 0);

    return {
      userId: user.id, nombre: user.nombre, cedula: user.cedula, email: user.email, zona: user.zona, role: user.role,
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
      totalKmRecorridos: Math.round(totalKmRecorridos * 100) / 100,
      registrosForaneo: fotosForaneo.length,
      fotos: user.fotoRegistros.map((f) => ({
        id: f.id,
        tipo: f.tipo,
        driveUrl: f.driveUrl,
        kmInicial: f.kmInicial,
        kmFinal: f.kmFinal,
        kmRecorridos: f.kmInicial != null && f.kmFinal != null ? Math.max(0, f.kmFinal - f.kmInicial) : null,
        observaciones: f.observaciones,
        fecha: f.createdAt,
      })),
      turnos: user.turnos,
    };
  });

  const resumen = {
    totalTecnicos: detalle.length,
    totalHorasExtra: Math.round(detalle.reduce((s, d) => s + d.totalHorasExtra, 0) * 100) / 100,
    totalRecargos: Math.round(detalle.reduce((s, d) => s + d.totalRecargos, 0) * 100) / 100,
    totalHorasOrdinarias: Math.round(detalle.reduce((s, d) => s + d.horasOrdinarias, 0) * 100) / 100,
    totalDisponibilidades: detalle.reduce((s, d) => s + d.totalDisponibilidades, 0),
    totalKmRecorridos: Math.round(detalle.reduce((s, d) => s + d.totalKmRecorridos, 0) * 100) / 100,
    totalRegistrosForaneo: detalle.reduce((s, d) => s + d.registrosForaneo, 0),
  };

  const alertas = detalle
    .filter((d) => d.totalHorasExtra > 40)
    .map((d) => ({ userId: d.userId, nombre: d.nombre, mensaje: `${d.nombre} acumula ${d.totalHorasExtra}h extras en el período` }));

  const foraneos = detalle.flatMap((d) =>
    d.fotos
      .filter((f) => f.tipo === "FORANEO")
      .map((f) => ({
        id: f.id,
        fecha: f.fecha,
        tecnico: d.nombre,
        cedula: d.cedula,
        correo: d.email,
        tipo: f.tipo,
        kmInicial: f.kmInicial,
        kmFinal: f.kmFinal,
        distancia: f.kmRecorridos,
        observaciones: f.observaciones,
        fotoUrl: f.driveUrl || "",
      }))
  );

  return NextResponse.json({ detalle, resumen, alertas, foraneos });
}
