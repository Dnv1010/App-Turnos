/**
 * Endpoint TEMPORAL de diagnóstico para entender por qué un turno no aparece
 * en el preview de Reportes Guardados.
 *
 * Uso: GET /api/admin/debug-shift?nombre=Duvan&fecha=2026-05-17
 * Devuelve el shift crudo (todos los campos) + diagnóstico de cada filtro.
 *
 * ELIMINAR cuando el bug esté resuelto.
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const profile = await getUserProfile(user.email!);
  if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  if (
    profile.role !== "ADMIN" &&
    profile.role !== "MANAGER" &&
    profile.role !== "COORDINADOR" &&
    profile.role !== "SUPPLY"
  ) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const nombre = searchParams.get("nombre") ?? "";
  const fecha = searchParams.get("fecha") ?? "";

  if (!nombre || !fecha) {
    return NextResponse.json(
      { error: "Pasa ?nombre=...&fecha=YYYY-MM-DD" },
      { status: 400 }
    );
  }

  // Buscar usuarios que matcheen el nombre (case-insensitive, partial)
  const usuarios = await prisma.user.findMany({
    where: {
      fullName: { contains: nombre, mode: "insensitive" },
    },
    select: {
      id: true,
      fullName: true,
      documentNumber: true,
      email: true,
      role: true,
      zone: true,
      isActive: true,
    },
  });

  if (usuarios.length === 0) {
    return NextResponse.json({
      error: `No se encontró usuario con nombre que contenga "${nombre}"`,
    });
  }

  // Rango de fecha: incluir desde día anterior hasta día siguiente para captar cruces de medianoche.
  const [y, m, d] = fecha.split("-").map(Number);
  const desdeUtc = new Date(Date.UTC(y, m - 1, d - 1, 0, 0, 0));
  const hastaUtc = new Date(Date.UTC(y, m - 1, d + 1, 23, 59, 59));

  const resultado = [];

  for (const u of usuarios) {
    const shifts = await prisma.shift.findMany({
      where: {
        userId: u.id,
        date: { gte: desdeUtc, lte: hastaUtc },
      },
      include: {
        reports: { select: { reportId: true } },
      },
      orderBy: { clockInAt: "asc" },
    });

    const shiftDiag = shifts.map((s) => {
      const heRecargoSum =
        (s.daytimeOvertimeHours ?? 0) +
        (s.nighttimeOvertimeHours ?? 0) +
        (s.sundayOvertimeHours ?? 0) +
        (s.nightSundayOvertimeHours ?? 0) +
        (s.nightSurchargeHours ?? 0) +
        (s.sundaySurchargeHours ?? 0) +
        (s.nightSundaySurchargeHours ?? 0);
      const yaEnReporte = s.reports.length > 0;
      const cancelado = s.notes?.startsWith("Cancelado") ?? false;
      const cerrado = s.clockOutAt !== null;

      return {
        id: s.id,
        // RAW: cómo viene de la BD
        date_iso: s.date.toISOString(),
        date_getUTCDate: s.date.getUTCDate(),
        date_getUTCMonth_1based: s.date.getUTCMonth() + 1,
        date_getUTCHours: s.date.getUTCHours(),
        date_getUTCMinutes: s.date.getUTCMinutes(),
        // CÓMO LO MUESTRA EL EXCEL (formatFechaDDMMYYYY usa getUTC*)
        excelFechaMostraria: `${String(s.date.getUTCDate()).padStart(2, "0")}/${String(s.date.getUTCMonth() + 1).padStart(2, "0")}/${s.date.getUTCFullYear()}`,
        // Día Colombia derivado del clockInAt (la fuente real)
        clockInAt_diaColombia: s.clockInAt
          .toLocaleDateString("en-CA", { timeZone: "America/Bogota" }),
        shiftType: s.shiftType,
        clockInAt: s.clockInAt.toISOString(),
        clockOutAt: s.clockOutAt?.toISOString() ?? null,
        notes: s.notes,
        regularHours: s.regularHours,
        daytimeOvertimeHours: s.daytimeOvertimeHours,
        nighttimeOvertimeHours: s.nighttimeOvertimeHours,
        sundayOvertimeHours: s.sundayOvertimeHours,
        nightSundayOvertimeHours: s.nightSundayOvertimeHours,
        nightSurchargeHours: s.nightSurchargeHours,
        sundaySurchargeHours: s.sundaySurchargeHours,
        nightSundaySurchargeHours: s.nightSundaySurchargeHours,
        yaEnReporte,
        reportIds: s.reports.map((r) => r.reportId),
        diagnostico: {
          cerrado,
          noCancelado: !cancelado,
          tieneHEoRecargo: heRecargoSum > 0,
          noEnOtroReporte: !yaEnReporte,
          aparecerianEnPreviewTecnico:
            cerrado &&
            !cancelado &&
            heRecargoSum > 0 &&
            !yaEnReporte &&
            s.shiftType === "TECHNICAL" &&
            u.role === "TECNICO",
          aparecerianEnPreviewCoord:
            cerrado &&
            !cancelado &&
            heRecargoSum > 0 &&
            !yaEnReporte &&
            s.shiftType === "COORDINATOR" &&
            (u.role === "COORDINADOR" || u.role === "COORDINADOR_INTERIOR"),
        },
      };
    });

    resultado.push({
      usuario: u,
      shiftsEncontrados: shifts.length,
      shifts: shiftDiag,
    });
  }

  return NextResponse.json({
    fechaConsultada: fecha,
    rangoBuscado: { gte: desdeUtc.toISOString(), lte: hastaUtc.toISOString() },
    coincidencias: resultado.length,
    resultados: resultado,
  });
}
