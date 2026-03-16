import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  if (session.user.role === "COORDINADOR") {
    if (target.role !== "TECNICO" || target.zona !== session.user.zona) {
      return NextResponse.json({ error: "Solo puedes editar técnicos de tu zona" }, { status: 403 });
    }
  } else if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
    return NextResponse.json({ error: "Sin permisos para editar usuarios" }, { status: 403 });
  }

  const body = await req.json();
  const { nombre, email, pin } = body;

  const data: { nombre?: string; email?: string; password?: string } = {};
  if (nombre != null) data.nombre = nombre;
  if (email != null) {
    const lower = (email as string).toLowerCase();
    const existing = await prisma.user.findFirst({ where: { email: lower, NOT: { id } } });
    if (existing) return NextResponse.json({ error: "El correo ya está en uso" }, { status: 400 });
    data.email = lower;
  }
  if (pin != null && pin !== "") data.password = await bcrypt.hash(pin, 10);

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, cedula: true, nombre: true, email: true, role: true, zona: true, isActive: true },
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
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  if (["COORDINADOR", "MANAGER", "ADMIN"].includes(target.role)) {
    return NextResponse.json({ error: "No se puede desactivar coordinadores, managers ni administradores" }, { status: 400 });
  }

  if (session.user.role === "COORDINADOR") {
    if (target.zona !== session.user.zona) {
      return NextResponse.json({ error: "Solo puedes desactivar técnicos de tu zona" }, { status: 403 });
    }
  } else if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  await prisma.user.update({
    where: { id },
    data: { isActive: false },
  });

  return NextResponse.json({ ok: true });
}
