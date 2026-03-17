import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Role, Zona } from "@prisma/client";
import bcrypt from "bcryptjs";

async function verificarAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") return null;
  return session;
}

export async function GET() {
  const session = await verificarAdmin();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const usuarios = await prisma.user.findMany({
    orderBy: { nombre: "asc" },
    select: { id: true, cedula: true, nombre: true, email: true, role: true, zona: true, isActive: true, createdAt: true },
  });

  return NextResponse.json(usuarios);
}

export async function POST(req: NextRequest) {
  const session = await verificarAdmin();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await req.json();
  const { cedula, nombre, email, pin, role, zona } = body;

  if (!cedula || !nombre || !email || !pin) {
    return NextResponse.json({ error: "Campos requeridos: cedula, nombre, email, pin" }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (exists) return NextResponse.json({ error: "Email ya registrado" }, { status: 400 });

  const pinNormalized = String(pin ?? "").trim();
  if (!pinNormalized) return NextResponse.json({ error: "El PIN es obligatorio" }, { status: 400 });
  const hashedPin = await bcrypt.hash(pinNormalized, 10);

  const usuario = await prisma.user.create({
    data: {
      cedula,
      nombre,
      email: email.toLowerCase(),
      password: hashedPin,
      role: (role as Role) || "TECNICO",
      zona: (zona as Zona) || "BOGOTA",
    },
  });

  return NextResponse.json({
    ok: true,
    user: { id: usuario.id, cedula: usuario.cedula, nombre: usuario.nombre, email: usuario.email, role: usuario.role, zona: usuario.zona },
  }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await verificarAdmin();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await req.json();
  const { id, ...updateData } = body;

  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (updateData.nombre) data.nombre = updateData.nombre;
  if (updateData.cedula) data.cedula = updateData.cedula;
  if (updateData.pin != null && String(updateData.pin).trim() !== "")
    data.password = await bcrypt.hash(String(updateData.pin).trim(), 10);
  if (updateData.role) data.role = updateData.role as Role;
  if (updateData.zona) data.zona = updateData.zona as Zona;
  if (typeof updateData.isActive === "boolean") data.isActive = updateData.isActive;

  const usuario = await prisma.user.update({ where: { id }, data });

  return NextResponse.json(usuario);
}
