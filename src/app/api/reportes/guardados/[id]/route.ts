export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertSesionReportesGuardados, puedeGestionarReporte } from "@/lib/reportes-guardados-api";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, context: Ctx) {
  const session = await getServerSession(authOptions);
  const auth = assertSesionReportesGuardados(session);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;

  const reporte = await prisma.reporte.findUnique({
    where: { id },
    select: { id: true, zona: true, creadoPor: true },
  });

  if (!reporte) {
    return NextResponse.json({ error: "Reporte no encontrado" }, { status: 404 });
  }

  if (!puedeGestionarReporte(auth.session, reporte)) {
    return NextResponse.json({ error: "Sin permiso para eliminar este reporte" }, { status: 403 });
  }

  await prisma.reporte.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
