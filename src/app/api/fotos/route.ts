import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { userId, base64Data, tipo, kmInicial, kmFinal, observaciones } = body;

  let driveFileId: string | null = null;
  let driveUrl: string | null = null;

  if (base64Data) {
    driveFileId = `placeholder_${Date.now()}`;
    driveUrl = `https://drive.google.com/file/d/${driveFileId}/view`;
  }

  const registro = await prisma.fotoRegistro.create({
    data: {
      userId: userId || session.user.userId,
      tipo: tipo || "GENERAL",
      driveFileId, driveUrl,
      kmInicial: kmInicial ? parseFloat(kmInicial) : null,
      kmFinal: kmFinal ? parseFloat(kmFinal) : null,
      observaciones,
    },
  });

  return NextResponse.json(registro, { status: 201 });
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
