/**
 * API Route: /api/usuarios
 * GET  - Listar usuarios (filtro por zona, role)
 * POST - Crear usuario (solo ADMIN)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const zona = searchParams.get("zona");
    const role = searchParams.get("role");

    const where: any = { isActive: true };
    if (zona && zona !== "ALL") where.zona = zona;
    if (role) where.role = role;

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        cedula: true,
        nombre: true,
        email: true,
        role: true,
        zona: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json({ ok: true, tecnicos: users });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cedula, nombre, email, pin, role, zona } = body;

    if (!cedula || !nombre || !email || !pin) {
      return NextResponse.json({ error: "Campos requeridos: cedula, nombre, email, pin" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: "El correo ya está registrado" }, { status: 400 });
    }

    const hashedPin = await bcrypt.hash(pin, 10);

    const user = await prisma.user.create({
      data: {
        cedula,
        nombre,
        email: email.toLowerCase(),
        password: hashedPin,
        role: role || "TECNICO",
        zona: zona || "BOGOTA",
      },
    });

    return NextResponse.json({
      ok: true,
      user: { id: user.id, cedula: user.cedula, nombre: user.nombre, email: user.email, role: user.role, zona: user.zona },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
