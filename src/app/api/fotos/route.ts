import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { uploadToDrive } from "@/lib/google-drive";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { userId, base64Data, tipo, turnoId, observaciones } = body;

  let driveFileId: string | null = null;
  let driveUrl: string | null = null;

  if (base64Data) {
    try {
      const uid = userId || session.user.userId;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `turno_${tipo || "FICHAJE"}_${uid}_${timestamp}.jpg`;

      const result = await uploadToDrive(base64Data, fileName);
      driveFileId = result.fileId;
      driveUrl = result.webViewLink;
    } catch (error) {
      console.error("Error subiendo a Google Drive:", error);
      return NextResponse.json(
        { error: "Error subiendo foto a Google Drive", details: String(error) },
        { status: 500 }
      );
    }
  }

  const registro = await prisma.fotoRegistro.create({
    data: {
      userId: userId || session.user.userId,
      tipo: tipo || "FICHAJE",
      driveFileId,
      driveUrl,
      observaciones: observaciones || (turnoId ? `Turno: ${turnoId}` : null),
    },
  });

  return NextResponse.json({ ...registro, driveUrl }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") || session.user.userId;

  const fotos = await prisma.fotoRegistro.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(fotos);
}
