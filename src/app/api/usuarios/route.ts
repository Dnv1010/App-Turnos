/**
 * API Route: /api/usuarios
 * GET  - Listar usuarios (filtro por zona, role)
 * POST - Crear usuario (ADMIN o COORDINADOR para técnicos de su zona)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { Cargo, Role, Zona } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = req.nextUrl;
    let zona = searchParams.get("zona");
    const role = searchParams.get("role");
    const cargo = searchParams.get("cargo");
    if ((session?.user?.role === "COORDINADOR" || session?.user?.role === "SUPPLY") && !zona) {
      zona = session.user.zona;
    }

    const where: Record<string, unknown> = { isActive: true };
    if (zona && zona !== "ALL") where.zona = zona;
    if (role) where.role = role;
    if (cargo && cargo !== "ALL" && Object.values(Cargo).includes(cargo as Cargo)) {
      where.cargo = cargo as Cargo;
    }

    const users = await prisma.user.findMany({
      where,
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
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json({ ok: true, tecnicos: users });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await req.json();
    const { cedula, nombre, email, pin, role: bodyRole, zona: bodyZona, cargo: bodyCargo } = body;

    if (!cedula || !nombre || !email || !pin) {
      return NextResponse.json({ error: "Campos requeridos: cedula, nombre, email, pin" }, { status: 400 });
    }

    let zona = (bodyZona || "BOGOTA") as string;
    let role = (bodyRole || "TECNICO") as string;
    if (session.user.role === "COORDINADOR") {
      if (role !== "TECNICO") return NextResponse.json({ error: "Solo puedes agregar operadores" }, { status: 403 });
      zona = session.user.zona;
    } else if (session.user.role === "SUPPLY") {
      if (role !== "TECNICO") return NextResponse.json({ error: "Solo puedes agregar operadores" }, { status: 403 });
      const z = typeof bodyZona === "string" && Object.values(Zona).includes(bodyZona as Zona) ? bodyZona : "BOGOTA";
      zona = z;
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: "El correo ya está registrado" }, { status: 400 });
    }
    const existingCedula = await prisma.user.findUnique({ where: { cedula } });
    if (existingCedula) return NextResponse.json({ error: "La cédula ya está registrada" }, { status: 400 });

    const pinNormalized = String(pin ?? "").trim();
    if (!pinNormalized) return NextResponse.json({ error: "El PIN es obligatorio" }, { status: 400 });
    const hashedPin = await bcrypt.hash(pinNormalized, 10);

    let cargoCreate =
      typeof bodyCargo === "string" && Object.values(Cargo).includes(bodyCargo as Cargo)
        ? (bodyCargo as Cargo)
        : Cargo.TECNICO;
    if (session.user.role === "SUPPLY") {
      cargoCreate = Cargo.ALMACENISTA;
    }

    const user = await prisma.user.create({
      data: {
        cedula,
        nombre,
        email: email.toLowerCase(),
        password: hashedPin,
        role: role as Role,
        zona: zona as Zona,
        cargo: cargoCreate,
      },
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        cedula: user.cedula,
        nombre: user.nombre,
        email: user.email,
        role: user.role,
        zona: user.zona,
        cargo: user.cargo,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
