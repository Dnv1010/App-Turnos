export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const { pinActual, pinNuevo } = await req.json();
    if (!pinActual || !pinNuevo) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }
    if (pinNuevo.length < 4) {
      return NextResponse.json({ error: "El PIN debe tener al menos 4 caracteres" }, { status: 400 });
    }
    const user = await prisma.user.findUnique({
      where: { id: session.user.userId },
      select: { password: true },
    });
    if (!user?.password) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    const valid = await bcrypt.compare(pinActual, user.password);
    if (!valid) {
      return NextResponse.json({ error: "PIN actual incorrecto" }, { status: 400 });
    }
    const hash = await bcrypt.hash(pinNuevo, 12);
    await prisma.user.update({
      where: { id: session.user.userId },
      data: { password: hash },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error al cambiar PIN" }, { status: 500 });
  }
}
