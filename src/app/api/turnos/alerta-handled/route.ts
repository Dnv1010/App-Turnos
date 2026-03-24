export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const { turnoId } = await req.json();
    if (!turnoId) return NextResponse.json({ error: "turnoId requerido" }, { status: 400 });
    await prisma.turno.updateMany({
      where: { id: turnoId, userId: session.user.userId },
      data: { jornadaAlertaPushSentAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
