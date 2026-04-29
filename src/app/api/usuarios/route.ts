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
import { JobTitle, Role, Zone } from "@prisma/client";

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
    if (emailFilter && emailFilter.toLowerCase() === user!.email!.toLowerCase()) {
      const self = await prisma.user.findUnique({
        where: { email: emailFilter.toLowerCase() },
        select: { id: true, documentNumber: true, fullName: true, email: true, role: true, zone: true, jobTitle: true, teamFilter: true, isActive: true, createdAt: true },
      });
      return NextResponse.json({ ok: true, tecnicos: self ? [self] : [] });
    }

    const ROLES_PERMITIDOS = new Set(["ADMIN", "MANAGER", "COORDINADOR", "COORDINADOR_INTERIOR", "SUPPLY"]);
    if (!ROLES_PERMITIDOS.has(profile.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if ((profile.role === "COORDINADOR" || profile.role === "COORDINADOR_INTERIOR" || profile.role === "SUPPLY") && !zona) {
      zona = profile.zone;
    }

    const where: Record<string, unknown> = { isActive: true };
    if (emailFilter) where.email = emailFilter.toLowerCase();
    if (zona && zona !== "ALL") where.zone = zona;
    if (role) where.role = role;
    if (cargo && cargo !== "ALL" && Object.values(JobTitle).includes(cargo as JobTitle)) {
      where.jobTitle = cargo as JobTitle;
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        documentNumber: true,
        fullName: true,
        email: true,
        role: true,
        zone: true,
        jobTitle: true,
        teamFilter: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { fullName: "asc" },
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
    const { documentNumber, fullName, email, pin, role: bodyRole, zone: bodyZone, jobTitle: bodyJobTitle } = body;

    if (!documentNumber || !fullName || !email || !pin) {
      return NextResponse.json({ error: "Campos requeridos: documentNumber, fullName, email, pin" }, { status: 400 });
    }

    let zone = (bodyZone || "BOGOTA") as string;
    let role = (bodyRole || "TECNICO") as string;
    if (profile.role === "COORDINADOR") {
      if (role !== "TECNICO") return NextResponse.json({ error: "Solo puedes agregar operadores" }, { status: 403 });
      zone = profile.zone;
    } else if (profile.role === "SUPPLY") {
      if (role !== "TECNICO") return NextResponse.json({ error: "Solo puedes agregar operadores" }, { status: 403 });
      const z = typeof bodyZone === "string" && Object.values(Zone).includes(bodyZone as Zone) ? bodyZone : "BOGOTA";
      zone = z;
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: "El correo ya está registrado" }, { status: 400 });
    }
    const existingDoc = await prisma.user.findUnique({ where: { documentNumber } });
    if (existingDoc) return NextResponse.json({ error: "La cédula ya está registrada" }, { status: 400 });

    const pinNormalized = String(pin ?? "").trim();
    if (!pinNormalized) return NextResponse.json({ error: "El PIN es obligatorio" }, { status: 400 });
    const hashedPin = await bcrypt.hash(pinNormalized, 10);

    let jobTitleCreate =
      typeof bodyJobTitle === "string" && Object.values(JobTitle).includes(bodyJobTitle as JobTitle)
        ? (bodyJobTitle as JobTitle)
        : JobTitle.TECNICO;
    if (profile.role === "SUPPLY") {
      jobTitleCreate = JobTitle.ALMACENISTA;
    }

    const newUser = await prisma.user.create({
      data: {
        documentNumber,
        fullName,
        email: email.toLowerCase(),
        password: hashedPin,
        role: role as Role,
        zone: zone as Zone,
        jobTitle: jobTitleCreate,
      },
    });

    return NextResponse.json({
      ok: true,
      user: newUser,
    });
  } catch (error: unknown) {
    console.error("[/api/usuarios]", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
