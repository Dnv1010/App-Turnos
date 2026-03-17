import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { uploadToDrive } from "@/lib/drive-upload";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    let body: { userId?: string; base64Data?: string; tipo?: string; turnoId?: string; observaciones?: string; kmInicial?: number; kmFinal?: number };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }
    const { userId, base64Data, tipo, turnoId, observaciones, kmInicial, kmFinal } = body ?? {};

    let driveFileId: string | null = null;
    let driveUrl: string | null = null;
    let base64Fallback: string | null = null;
    let usedFallback = false;

    if (base64Data) {
      try {
        console.log("[Fotos] base64Data length:", base64Data?.length);
        console.log("[Fotos] base64Data prefix:", base64Data?.substring(0, 30));

        const uid = userId || session.user.userId;
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const fileName = `turno_${tipo || "FICHAJE"}_${uid}_${timestamp}.jpg`;

        const result = await uploadToDrive(base64Data, fileName);
        driveFileId = result.fileId;
        driveUrl = result.webViewLink;
      } catch (error) {
        console.error("[Fotos] Error subiendo a Google Drive, guardando fallback en BD:", error);
        usedFallback = true;
        base64Fallback = typeof base64Data === "string" ? base64Data.replace(/^data:image\/\w+;base64,/, "") : base64Data;
      }
    }

    const registro = await prisma.fotoRegistro.create({
      data: {
        userId: userId || session.user.userId,
        tipo: tipo || "FICHAJE",
        driveFileId,
        driveUrl,
        base64Fallback,
        observaciones: observaciones || (turnoId ? `Turno: ${turnoId}` : null),
        kmInicial: kmInicial != null ? parseFloat(String(kmInicial)) : null,
        kmFinal: kmFinal != null ? parseFloat(String(kmFinal)) : null,
      },
    });

    return NextResponse.json(
      { ...registro, driveUrl, fallback: usedFallback },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error al registrar foto";
    console.error("[POST /api/fotos]", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") || session.user.userId;
  const inicio = searchParams.get("inicio");
  const fin = searchParams.get("fin");

  const where: { userId: string; createdAt?: { gte?: Date; lte?: Date } } = { userId };
  if (inicio || fin) {
    where.createdAt = {};
    if (inicio) {
      const [y, m, d] = inicio.split("-").map(Number);
      where.createdAt.gte = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    }
    if (fin) {
      const [y, m, d] = fin.split("-").map(Number);
      where.createdAt.lte = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));
    }
  }

  const fotos = await prisma.fotoRegistro.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(fotos);
}
