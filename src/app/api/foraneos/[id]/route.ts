export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import type { ApprovalStatus, Zone } from "@prisma/client";

function canEditForaneoRole(role: string) {
  return role === "COORDINADOR" || role === "ADMIN" || role === "MANAGER";
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const profile = await getUserProfile(user.email!);
    if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (!canEditForaneoRole(profile.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const foraneoId = params.id;
    const body = await req.json();
    const { startKm, endKm, notes, approvalStatus, approvalNote } = body;

    const foto = await prisma.tripRecord.findUnique({
      where: { id: foraneoId },
      include: { user: { select: { zone: true } } },
    });
    if (!foto) return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });

    if (foto.type !== "FORANEO") {
      return NextResponse.json({ error: "No es un registro foráneo" }, { status: 400 });
    }

    if (
      profile.role === "COORDINADOR" &&
      foto.user.zone !== (profile.zone as Zone)
    ) {
      return NextResponse.json({ error: "No autorizado para esta zona" }, { status: 403 });
    }

    // Aprobación / rechazo
    if (approvalStatus === "APROBADA" || approvalStatus === "NO_APROBADA") {
      const updated = await prisma.tripRecord.update({
        where: { id: foraneoId },
        data: {
          approvalStatus: approvalStatus as ApprovalStatus,
          approvedBy: profile.id,
          approvedAt: new Date(),
          approvalNote: typeof approvalNote === "string" && approvalNote.trim() ? approvalNote.trim() : null,
        },
        include: { user: { select: { fullName: true, documentNumber: true } } },
      });

      try {
        const origin = new URL(req.url).origin;
        const cookie = req.headers.get("cookie") ?? "";
        await fetch(`${origin}/api/sheets/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
        });
      } catch (err) {
        console.error("Error sync Sheets tras aprobar foráneo:", err);
      }

      return NextResponse.json({ ok: true, foraneo: updated });
    }

    const updateData: Record<string, unknown> = {};
    if (startKm !== undefined) {
      const v = parseFloat(String(startKm));
      if (!Number.isNaN(v)) updateData.startKm = v;
    }
    if (endKm !== undefined) {
      const v = parseFloat(String(endKm));
      if (!Number.isNaN(v)) updateData.endKm = v;
    }
    if (notes !== undefined) updateData.notes = notes;

    const updated = await prisma.tripRecord.update({
      where: { id: foraneoId },
      data: updateData,
      include: { user: { select: { fullName: true, documentNumber: true } } },
    });

    try {
      const origin = new URL(req.url).origin;
      const cookie = req.headers.get("cookie") ?? "";
      await fetch(`${origin}/api/sheets/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      });
    } catch (err) {
      console.error("Error sync Sheets tras editar foráneo:", err);
    }

    return NextResponse.json({ ok: true, foraneo: updated });
  } catch (error) {
    console.error("[PATCH /api/foraneos/[id]]", error);
    return NextResponse.json({ error: "Error al editar" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const profile = await getUserProfile(user.email!);
    if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (!canEditForaneoRole(profile.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const foraneoId = params.id;
    const foto = await prisma.tripRecord.findUnique({
      where: { id: foraneoId },
      include: { user: { select: { zone: true } } },
    });
    if (!foto) return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });

    if (
      profile.role === "COORDINADOR" &&
      foto.user.zone !== (profile.zone as Zone)
    ) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    await prisma.tripRecord.delete({ where: { id: foraneoId } });

    try {
      const origin = new URL(req.url).origin;
      const cookie = req.headers.get("cookie") ?? "";
      await fetch(`${origin}/api/sheets/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      });
    } catch (err) {
      console.error("Error sync Sheets tras eliminar foráneo:", err);
    }

    return NextResponse.json({ success: true, message: "Foráneo eliminado" });
  } catch (error) {
    console.error("[DELETE /api/foraneos/[id]]", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
