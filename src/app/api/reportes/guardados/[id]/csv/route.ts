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

  const reporte = await prisma.report.findUnique({
    where: { id },
    include: {
      shiftsIncluded: {
        include: {
          shift: {
            include: { user: { select: { fullName: true, documentNumber: true } } },
          },
        },
      },
      tripsIncluded: {
        include: {
          tripRecord: {
            include: { user: { select: { fullName: true, documentNumber: true } } },
          },
        },
      },
      availabilitiesIncluded: {
        include: {
          shiftSchedule: {
            include: { user: { select: { fullName: true, documentNumber: true, role: true } } },
          },
        },
      },
      coordinatorShiftsIncluded: {
        include: {
          coordinatorShift: {
            include: { user: { select: { fullName: true, documentNumber: true, role: true } } },
          },
        },
      },
    },
  });

  if (!reporte) {
    return NextResponse.json({ error: "Reporte no encontrado" }, { status: 404 });
  }

  if (!puedeGestionarReporte(auth.profile, { zone: reporte.zone, createdBy: reporte.createdBy })) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const turnos = reporte.shiftsIncluded.map((rt) => ({
    fecha: rt.shift.date,
    horaEntrada: rt.shift.clockInAt,
    horaSalida: rt.shift.clockOutAt,
    horasOrdinarias: rt.shift.regularHours,
    heDiurna: rt.shift.daytimeOvertimeHours,
    heNocturna: rt.shift.nighttimeOvertimeHours,
    heDominical: rt.shift.sundayOvertimeHours,
    heNoctDominical: rt.shift.nightSundayOvertimeHours,
    recNocturno: rt.shift.nightSurchargeHours,
    recDominical: rt.shift.sundaySurchargeHours,
    recNoctDominical: rt.shift.nightSundaySurchargeHours,
    user: {
      nombre: rt.shift.user.fullName,
      cedula: rt.shift.user.documentNumber,
    },
  }));
  const fotosForaneos = reporte.tripsIncluded.map((rf) => ({
    createdAt: rf.tripRecord.createdAt,
    kmInicial: rf.tripRecord.startKm,
    kmFinal: rf.tripRecord.endKm,
    user: {
      nombre: rf.tripRecord.user.fullName,
      cedula: rf.tripRecord.user.documentNumber,
    },
  }));
  const disponibilidades = reporte.availabilitiesIncluded.map((rd) => ({
    fecha: rd.shiftSchedule.date,
    valor: rd.shiftSchedule.shiftCode,
    user: {
      nombre: rd.shiftSchedule.user.fullName,
      cedula: rd.shiftSchedule.user.documentNumber,
      role: rd.shiftSchedule.user.role,
    },
  }));
  const turnosCoordinador = reporte.coordinatorShiftsIncluded.map((r) => ({
    fecha: r.coordinatorShift.date,
    horaEntrada: r.coordinatorShift.clockInAt,
    horaSalida: r.coordinatorShift.clockOutAt,
    codigoOrden: r.coordinatorShift.orderCode,
    horasOrdinarias: r.coordinatorShift.regularHours,
    heDiurna: r.coordinatorShift.daytimeOvertimeHours,
    heNocturna: r.coordinatorShift.nighttimeOvertimeHours,
    heDominical: r.coordinatorShift.sundayOvertimeHours,
    heNoctDominical: r.coordinatorShift.nightSundayOvertimeHours,
    recNocturno: r.coordinatorShift.nightSurchargeHours,
    recDominical: r.coordinatorShift.sundaySurchargeHours,
    recNoctDominical: r.coordinatorShift.nightSundaySurchargeHours,
    user: {
      nombre: r.coordinatorShift.user.fullName,
      cedula: r.coordinatorShift.user.documentNumber,
      role: r.coordinatorShift.user.role,
    },
  }));

  const csvBody = buildReporteGuardadoCsvString(turnos, turnosCoordinador, fotosForaneos, disponibilidades);
  const bom = "﻿";
  const filename = `Reporte-${slugNombreReporteArchivo(reporte.name, reporte.id)}.csv`;

  return new NextResponse(bom + csvBody, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
