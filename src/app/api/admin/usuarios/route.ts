import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Role, Zona, Cargo } from "@prisma/client";
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
    select: {
      id: true,
      cedula: true,
      nombre: true,
      email: true,
      role: true,
      zona: true,
      cargo: true,
      filtroEquipo: true,
      isActive: true,
      createdAt: true,
    },
  });

  return NextResponse.json(usuarios);
}

export async function POST(req: NextRequest) {
  const session = await verificarAdmin();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await req.json();
  const { cedula, nombre, email, pin, role, zona, isActive, cargo: bodyCargo } = body;

  if (!cedula || !nombre || !email || !pin) {
    return NextResponse.json({ error: "Campos requeridos: cedula, nombre, email, pin" }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { email: (email as string).toLowerCase() } });
  if (exists) return NextResponse.json({ error: "Email ya registrado" }, { status: 400 });

  const pinStr = String(pin ?? "").trim();
  if (!pinStr) return NextResponse.json({ error: "El PIN es obligatorio" }, { status: 400 });
  if (pinStr.length !== 4) return NextResponse.json({ error: "El PIN debe tener 4 dígitos" }, { status: 400 });
  const hashedPin = await bcrypt.hash(pinStr, 10);

  const activo = typeof isActive === "boolean" ? isActive : true;

  const cargoCreate =
    typeof bodyCargo === "string" && Object.values(Cargo).includes(bodyCargo as Cargo)
      ? (bodyCargo as Cargo)
      : Cargo.TECNICO;

  const usuario = await prisma.user.create({
    data: {
      cedula: String(cedula),
      nombre: String(nombre),
      email: (email as string).toLowerCase(),
      password: hashedPin,
      role: (role as Role) || "TECNICO",
      zona: (zona as Zona) || "BOGOTA",
      cargo: cargoCreate,
      isActive: activo,
    },
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: usuario.id,
      cedula: usuario.cedula,
      nombre: usuario.nombre,
      email: usuario.email,
      role: usuario.role,
      zona: usuario.zona,
      cargo: usuario.cargo,
      filtroEquipo: usuario.filtroEquipo,
      isActive: usuario.isActive,
    },
  }, { status: 201 });
}
