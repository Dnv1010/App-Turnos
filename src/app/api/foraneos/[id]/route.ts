export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import type { EstadoAprobacion, Zona } from "@prisma/client";

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
    const { kmInicial, kmFinal, observaciones, estadoAprobacion, notaAprobacion } = body;

    const foto = await prisma.fotoRegistro.findUnique({
      where: { id: foraneoId },
      include: { user: { select: { zona: true } } },
    });
    if (!foto) return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });

    if (foto.tipo !== "FORANEO") {
      return NextResponse.json({ error: "No es un registro foráneo" }, { status: 400 });
    }

    if (
      profile.role === "COORDINADOR" &&
      foto.user.zona !== (profile.zona as Zona)
    ) {
      return NextResponse.json({ error: "No autorizado para esta zona" }, { status: 403 });
    }

    // Aprobación / rechazo
    if (estadoAprobacion === "APROBADA" || estadoAprobacion === "NO_APROBADA") {
      const updated = await prisma.fotoRegistro.update({
        where: { id: foraneoId },
        data: {
          estadoAprobacion: estadoAprobacion as EstadoAprobacion,
          aprobadoPor: profile.id,
          fechaAprobacion: new Date(),
          notaAprobacion: typeof notaAprobacion === "string" && notaAprobacion.trim() ? notaAprobacion.trim() : null,
        },
        include: { user: { select: { nombre: true, cedula: true } } },
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
    if (kmInicial !== undefined) {
      const v = parseFloat(String(kmInicial));
      if (!Number.isNaN(v)) updateData.kmInicial = v;
    }
    if (kmFinal !== undefined) {
      const v = parseFloat(String(kmFinal));
      if (!Number.isNaN(v)) updateData.kmFinal = v;
    }
    if (observaciones !== undefined) updateData.observaciones = observaciones;

    const updated = await prisma.fotoRegistro.update({
      where: { id: foraneoId },
      data: updateData,
      include: { user: { select: { nombre: true, cedula: true } } },
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
    const foto = await prisma.fotoRegistro.findUnique({
      where: { id: foraneoId },
      include: { user: { select: { zona: true } } },
    });
    if (!foto) return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });

    if (
      profile.role === "COORDINADOR" &&
      foto.user.zona !== (profile.zona as Zona)
    ) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    await prisma.fotoRegistro.delete({ where: { id: foraneoId } });

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
