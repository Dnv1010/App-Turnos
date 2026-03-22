export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { Zona } from "@prisma/client";

function canEditForaneoRole(role: string) {
  return role === "COORDINADOR" || role === "ADMIN" || role === "MANAGER";
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canEditForaneoRole(session.user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const foraneoId = params.id;
    const body = await req.json();
    const { kmInicial, kmFinal, observaciones } = body;

    const foto = await prisma.fotoRegistro.findUnique({
      where: { id: foraneoId },
      include: { user: { select: { zona: true } } },
    });
    if (!foto) return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });

    if (
      session.user.role === "COORDINADOR" &&
      foto.user.zona !== (session.user.zona as Zona)
    ) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
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
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canEditForaneoRole(session.user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const foraneoId = params.id;
    const foto = await prisma.fotoRegistro.findUnique({
      where: { id: foraneoId },
      include: { user: { select: { zona: true } } },
    });
    if (!foto) return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });

    if (
      session.user.role === "COORDINADOR" &&
      foto.user.zona !== (session.user.zona as Zona)
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
