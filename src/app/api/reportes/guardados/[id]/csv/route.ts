export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { prisma } from "@/lib/prisma";
import { assertSesionReportesGuardados, puedeGestionarReporte } from "@/lib/reportes-guardados-api";
import { buildReporteGuardadoCsvString, slugNombreReporteArchivo } from "@/lib/buildReporteGuardadoCsv";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: Ctx) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const profile = await getUserProfile(user.email!);
  const auth = assertSesionReportesGuardados(profile);
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
            include: { user: { select: { nombre: true, cedula: true, role: true } } },
          },
        },
      },
      turnosCoordinadorIncluidos: {
        include: {
          turnoCoordinador: {
            include: { user: { select: { nombre: true, cedula: true, role: true } } },
          },
        },
      },
    },
  });

  if (!reporte) {
    return NextResponse.json({ error: "Reporte no encontrado" }, { status: 404 });
  }

  if (!puedeGestionarReporte(auth.profile, reporte)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const turnos = reporte.turnosIncluidos.map((rt) => rt.turno);
  const fotosForaneos = reporte.foraneosIncluidos.map((rf) => rf.fotoRegistro);
  const disponibilidades = reporte.disponibilidadesIncluidas.map((rd) => ({
    fecha: rd.mallaTurno.fecha,
    valor: rd.mallaTurno.valor,
    user: {
      nombre: rd.mallaTurno.user.nombre,
      cedula: rd.mallaTurno.user.cedula,
      role: rd.mallaTurno.user.role,
    },
  }));
  const turnosCoordinador = reporte.turnosCoordinadorIncluidos.map((r) => ({
    fecha: r.turnoCoordinador.fecha,
    horaEntrada: r.turnoCoordinador.horaEntrada,
    horaSalida: r.turnoCoordinador.horaSalida,
    codigoOrden: r.turnoCoordinador.codigoOrden,
    horasOrdinarias: r.turnoCoordinador.horasOrdinarias,
    heDiurna: r.turnoCoordinador.heDiurna,
    heNocturna: r.turnoCoordinador.heNocturna,
    heDominical: r.turnoCoordinador.heDominical,
    heNoctDominical: r.turnoCoordinador.heNoctDominical,
    recNocturno: r.turnoCoordinador.recNocturno,
    recDominical: r.turnoCoordinador.recDominical,
    recNoctDominical: r.turnoCoordinador.recNoctDominical,
    user: {
      nombre: r.turnoCoordinador.user.nombre,
      cedula: r.turnoCoordinador.user.cedula,
      role: r.turnoCoordinador.user.role,
    },
  }));

  const csvBody = buildReporteGuardadoCsvString(turnos, turnosCoordinador, fotosForaneos, disponibilidades);
  const bom = "\uFEFF";
  const filename = `Reporte-${slugNombreReporteArchivo(reporte.nombre, reporte.id)}.csv`;

  return new NextResponse(bom + csvBody, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
