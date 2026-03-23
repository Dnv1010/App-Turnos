export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { EstadoAprobacion, Prisma, Zona } from "@prisma/client";

function canAprobarRole(role: string) {
  return role === "COORDINADOR" || role === "MANAGER" || role === "ADMIN";
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canAprobarRole(session.user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    let body: { ids?: string[]; estadoAprobacion?: string; notaAprobacion?: string | null };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const { ids, estadoAprobacion, notaAprobacion } = body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids requerido (array no vacío)" }, { status: 400 });
    }
    if (estadoAprobacion !== "APROBADA" && estadoAprobacion !== "NO_APROBADA") {
      return NextResponse.json({ error: "estadoAprobacion debe ser APROBADA o NO_APROBADA" }, { status: 400 });
    }

    const estado = estadoAprobacion as EstadoAprobacion;

    const where: Prisma.FotoRegistroWhereInput = {
      id: { in: ids },
      tipo: "FORANEO",
      ...(session.user.role === "COORDINADOR"
        ? { user: { zona: session.user.zona as Zona } }
        : {}),
    };

    const countMatch = await prisma.fotoRegistro.count({ where });
    if (countMatch !== ids.length) {
      return NextResponse.json(
        { error: "Algunos registros no existen o no tienes permiso en esta zona" },
        { status: 400 }
      );
    }

    const now = new Date();
    const actorId = session.user.userId;

    const { count } = await prisma.fotoRegistro.updateMany({
      where,
      data: {
        estadoAprobacion: estado,
        aprobadoPor: actorId,
        fechaAprobacion: now,
        notaAprobacion: notaAprobacion?.trim() ? notaAprobacion.trim() : null,
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
