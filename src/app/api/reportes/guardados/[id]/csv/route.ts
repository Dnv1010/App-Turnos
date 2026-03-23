export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertSesionReportesGuardados, puedeGestionarReporte } from "@/lib/reportes-guardados-api";
import { buildReporteGuardadoCsvString, slugNombreReporteArchivo } from "@/lib/buildReporteGuardadoCsv";

type Ctx = { params: Promise<{ id: string }> };

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
    },
  });

  if (!reporte) {
    return NextResponse.json({ error: "Reporte no encontrado" }, { status: 404 });
  }

  if (!puedeGestionarReporte(auth.session, reporte)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const turnos = reporte.turnosIncluidos.map((rt) => rt.turno);
  const fotosForaneos = reporte.foraneosIncluidos.map((rf) => rf.fotoRegistro);

  const csvBody = buildReporteGuardadoCsvString(turnos, fotosForaneos);
  const bom = "\uFEFF";
  const filename = `Reporte-${slugNombreReporteArchivo(reporte.nombre, reporte.id)}.csv`;

  return new NextResponse(bom + csvBody, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
