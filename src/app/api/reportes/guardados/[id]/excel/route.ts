export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertSesionReportesGuardados, puedeGestionarReporte } from "@/lib/reportes-guardados-api";
import { buildReporteGuardadoExcelBuffer } from "@/lib/buildReporteExcelBuffer";

type Ctx = { params: Promise<{ id: string }> };

function slugNombre(nombre: string, id: string): string {
  const s = nombre
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return s || id.slice(0, 8);
}

export async function GET(_req: NextRequest, context: Ctx) {
  const session = await getServerSession(authOptions);
  const auth = assertSesionReportesGuardados(session);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;

  const reporte = await prisma.reporte.findUnique({
    where: { id },
    include: {
      turnosIncluidos: {
        include: {
          turno: {
            include: { user: { select: { nombre: true, cedula: true } } },
          },
        },
      },
      foraneosIncluidos: {
        include: {
          fotoRegistro: {
            include: { user: { select: { nombre: true, cedula: true } } },
          },
        },
      },
      disponibilidadesIncluidas: {
        include: {
          mallaTurno: {
            include: { user: { select: { nombre: true, cedula: true } } },
          },
        },
      },
    },
  });

  if (!reporte) {
    return NextResponse.json({ error: "Reporte no encontrado" }, { status: 404 });
  }

  if (!puedeGestionarReporte(auth.session, reporte)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const turnos = reporte.turnosIncluidos.map((rt) => rt.turno);
  const fotosForaneos = reporte.foraneosIncluidos.map((rf) => ({
    userId: rf.fotoRegistro.userId,
    kmInicial: rf.fotoRegistro.kmInicial,
    kmFinal: rf.fotoRegistro.kmFinal,
    user: rf.fotoRegistro.user,
  }));
  const disponibilidades = reporte.disponibilidadesIncluidas.map((rd) => ({
    fecha: rd.mallaTurno.fecha,
    valor: rd.mallaTurno.valor,
    user: rd.mallaTurno.user,
  }));

  const { buffer, filename } = buildReporteGuardadoExcelBuffer(
    turnos,
    fotosForaneos,
    disponibilidades,
    slugNombre(reporte.nombre, reporte.id)
  );

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
