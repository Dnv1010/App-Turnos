export const dynamic = "force-dynamic";
/**
 * API Route: /api/usuarios
 * GET  - Listar usuarios (filtro por zona, role)
 * POST - Crear usuario (ADMIN o COORDINADOR para técnicos de su zona)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import bcrypt from "bcryptjs";
import { Cargo, Role, Zona } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    const profile = user ? await getUserProfile(user.email!) : null;

    if (!profile) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { searchParams } = req.nextUrl;
    let zona = searchParams.get("zona");
    const role = searchParams.get("role");
    const cargo = searchParams.get("cargo");
    const emailFilter = searchParams.get("email");

    // Cualquier usuario autenticado puede consultar su propio perfil
    if (emailFilter && emailFilter.toLowerCase() === user.email!.toLowerCase()) {
      const self = await prisma.user.findUnique({
        where: { email: emailFilter.toLowerCase() },
        select: { id: true, cedula: true, nombre: true, email: true, role: true, zona: true, cargo: true, filtroEquipo: true, isActive: true, createdAt: true },
      });
      return NextResponse.json({ ok: true, tecnicos: self ? [self] : [] });
    }

    const ROLES_PERMITIDOS = new Set(["ADMIN", "MANAGER", "COORDINADOR", "COORDINADOR_INTERIOR", "SUPPLY"]);
    if (!ROLES_PERMITIDOS.has(profile.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if ((profile.role === "COORDINADOR" || profile.role === "COORDINADOR_INTERIOR" || profile.role === "SUPPLY") && !zona) {
      zona = profile.zona;
    }

    const where: Record<string, unknown> = { isActive: true };
    if (emailFilter) where.email = emailFilter.toLowerCase();
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
  } catch (error: unknown) {
    console.error("[/api/usuarios]", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const profile = await getUserProfile(user.email!);
    if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    const body = await req.json();
    const { cedula, nombre, email, pin, role: bodyRole, zona: bodyZona, cargo: bodyCargo } = body;

    if (!cedula || !nombre || !email || !pin) {
      return NextResponse.json({ error: "Campos requeridos: cedula, nombre, email, pin" }, { status: 400 });
    }

    let zona = (bodyZona || "BOGOTA") as string;
    let role = (bodyRole || "TECNICO") as string;
    if (profile.role === "COORDINADOR") {
      if (role !== "TECNICO") return NextResponse.json({ error: "Solo puedes agregar operadores" }, { status: 403 });
      zona = profile.zona;
    } else if (profile.role === "SUPPLY") {
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
    if (profile.role === "SUPPLY") {
      cargoCreate = Cargo.ALMACENISTA;
    }

    const newUser = await prisma.user.create({
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
        id: newUser.id,
        cedula: newUser.cedula,
        nombre: newUser.nombre,
        email: newUser.email,
        role: newUser.role,
        zona: newUser.zona,
        cargo: newUser.cargo,
      },
    });
  } catch (error: unknown) {
    console.error("[/api/usuarios]", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
