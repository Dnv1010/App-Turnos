export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import type { ApprovalStatus, Prisma, Zone } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const profile = await getUserProfile(user.email!);
    if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const desde = searchParams.get("desde");
    const hasta = searchParams.get("hasta");
    const userId = searchParams.get("userId");
    const estadoParam = searchParams.get("estado"); // PENDIENTE | APROBADA | NO_APROBADA | ALL

    if (!desde || !hasta) {
      return NextResponse.json({ error: "Parámetros desde y hasta requeridos" }, { status: 400 });
    }

    const [yi, mi, di] = desde.split("-").map(Number);
    const [yf, mf, df] = hasta.split("-").map(Number);
    const fechaInicio = new Date(Date.UTC(yi, mi - 1, di, 0, 0, 0));
    const fechaFin = new Date(Date.UTC(yf, mf - 1, df, 23, 59, 59));

    const whereUser: Prisma.UserWhereInput = { isActive: true, role: "TECNICO" };
    if (profile.role === "COORDINADOR") {
      whereUser.zone = profile.zone as Zone;
    } else if (profile.role === "TECNICO") {
      whereUser.id = profile.id;
    }
    if (userId && userId !== "ALL") whereUser.id = userId;

    const usuarios = await prisma.user.findMany({
      where: whereUser,
      select: { id: true },
    });
    const userIds = usuarios.map((u) => u.id);
    if (userIds.length === 0) return NextResponse.json([]);

    const estadoWhere: { approvalStatus?: ApprovalStatus } = {};
    if (estadoParam === "PENDIENTE" || estadoParam === "APROBADA" || estadoParam === "NO_APROBADA") {
      estadoWhere.approvalStatus = estadoParam;
    }

    const fotos = await prisma.tripRecord.findMany({
      where: {
        type: "FORANEO",
        createdAt: { gte: fechaInicio, lte: fechaFin },
        userId: { in: userIds },
        ...estadoWhere,
      },
      include: { user: { select: { id: true, fullName: true, documentNumber: true, zone: true } } },
      orderBy: { createdAt: "desc" },
    });

    const lista = fotos.map((f) => ({
      id: f.id,
      fullName: f.user.fullName,
      documentNumber: f.user.documentNumber,
      zone: f.user.zone,
      createdAt: f.createdAt.toISOString(),
      startKm: f.startKm,
      endKm: f.endKm,
      kmRecorridos:
        f.startKm != null && f.endKm != null ? Math.max(0, f.endKm - f.startKm) : null,
      driveUrl: f.driveUrl,
      driveUrlFinal: f.driveUrlFinal,
      startLat: f.startLat ?? null,
      startLng: f.startLng ?? null,
      endLat: f.endLat ?? null,
      endLng: f.endLng ?? null,
      notes: f.notes,
      approvalStatus: f.approvalStatus,
      approvedBy: f.approvedBy,
      approvedAt: f.approvedAt?.toISOString() ?? null,
      approvalNote: f.approvalNote,
    }));

    return NextResponse.json(lista);
  } catch (e) {
    console.error("[GET /api/foraneos]", e);
    return NextResponse.json({ error: "Error interno al obtener foráneos" }, { status: 500 });
  }
}
