import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const registro = await prisma.fotoRegistro.findUnique({ where: { id } });
  if (!registro) return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
  if (registro.userId !== session.user.userId) {
    return NextResponse.json({ error: "No puedes editar este registro" }, { status: 403 });
  }
  if (registro.tipo !== "FORANEO") {
    return NextResponse.json({ error: "Solo se pueden editar registros foráneos" }, { status: 400 });
  }

  const body = await req.json();
  const { kmInicial, kmFinal, observaciones } = body;
  const data: { kmInicial?: number; kmFinal?: number; observaciones?: string } = {};
  if (kmInicial != null) data.kmInicial = parseFloat(kmInicial);
  if (kmFinal != null) data.kmFinal = parseFloat(kmFinal);
  if (observaciones !== undefined) data.observaciones = observaciones || null;

  const updated = await prisma.fotoRegistro.update({
    where: { id },
    data,
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const registro = await prisma.fotoRegistro.findUnique({ where: { id } });
  if (!registro) return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
  if (registro.userId !== session.user.userId) {
    return NextResponse.json({ error: "No puedes eliminar este registro" }, { status: 403 });
  }

  await prisma.fotoRegistro.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
