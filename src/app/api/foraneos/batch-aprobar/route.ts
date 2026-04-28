export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import type { ApprovalStatus, Prisma, Zone } from "@prisma/client";

function canAprobarRole(role: string) {
  return role === "COORDINADOR" || role === "MANAGER" || role === "ADMIN";
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const profile = await getUserProfile(user.email!);
    if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (!canAprobarRole(profile.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    let body: { ids?: string[]; approvalStatus?: string; approvalNote?: string | null };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const { ids, approvalStatus, approvalNote } = body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids requerido (array no vacío)" }, { status: 400 });
    }
    if (approvalStatus !== "APROBADA" && approvalStatus !== "NO_APROBADA") {
      return NextResponse.json({ error: "approvalStatus debe ser APROBADA o NO_APROBADA" }, { status: 400 });
    }

    const estado = approvalStatus as ApprovalStatus;

    const where: Prisma.TripRecordWhereInput = {
      id: { in: ids },
      type: "FORANEO",
      ...(profile.role === "COORDINADOR"
        ? { user: { zone: profile.zone as Zone } }
        : {}),
    };

    const countMatch = await prisma.tripRecord.count({ where });
    if (countMatch !== ids.length) {
      return NextResponse.json(
        { error: "Algunos registros no existen o no tienes permiso en esta zona" },
        { status: 400 }
      );
    }

    const now = new Date();
    const actorId = profile.id;

    const { count } = await prisma.tripRecord.updateMany({
      where,
      data: {
        approvalStatus: estado,
        approvedBy: actorId,
        approvedAt: now,
        approvalNote: approvalNote?.trim() ? approvalNote.trim() : null,
      },
    });

    try {
      const origin = new URL(req.url).origin;
      const cookie = req.headers.get("cookie") ?? "";
      await fetch(`${origin}/api/sheets/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      });
    } catch (err) {
      console.error("Error sync Sheets tras batch foráneos:", err);
    }

    return NextResponse.json({ ok: true, actualizados: count });
  } catch (e) {
    console.error("[PATCH /api/foraneos/batch-aprobar]", e);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}
