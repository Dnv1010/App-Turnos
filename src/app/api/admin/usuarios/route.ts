export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { Role, Zone, JobTitle } from "@prisma/client";
import type { User } from "@prisma/client";
import bcrypt from "bcryptjs";

async function verificarAdmin(): Promise<User | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await getUserProfile(user.email!);
  if (!profile || profile.role !== "ADMIN") return null;
  return profile;
}

export async function GET() {
  const session = await verificarAdmin();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const usuarios = await prisma.user.findMany({
    orderBy: { fullName: "asc" },
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
  });

  return NextResponse.json(usuarios);
}

export async function POST(req: NextRequest) {
  const session = await verificarAdmin();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await req.json();
  const { documentNumber, fullName, email, pin, role, zone, isActive, jobTitle: bodyJobTitle } = body;

  if (!documentNumber || !fullName || !email || !pin) {
    return NextResponse.json({ error: "Campos requeridos: documentNumber, fullName, email, pin" }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { email: (email as string).toLowerCase() } });
  if (exists) return NextResponse.json({ error: "Email ya registrado" }, { status: 400 });

  const pinStr = String(pin ?? "").trim();
  if (!pinStr) return NextResponse.json({ error: "El PIN es obligatorio" }, { status: 400 });
  if (pinStr.length !== 4) return NextResponse.json({ error: "El PIN debe tener 4 dígitos" }, { status: 400 });
  const hashedPin = await bcrypt.hash(pinStr, 10);

  const activo = typeof isActive === "boolean" ? isActive : true;

  const roleResolved = (role as Role) || Role.TECNICO;
  const teamFilterDefault = roleResolved === Role.SUPPLY ? "ALMACENISTA" : "TODOS";

  const jobTitleCreate =
    typeof bodyJobTitle === "string" && Object.values(JobTitle).includes(bodyJobTitle as JobTitle)
      ? (bodyJobTitle as JobTitle)
      : JobTitle.TECNICO;

  const usuario = await prisma.user.create({
    data: {
      documentNumber: String(documentNumber),
      fullName: String(fullName),
      email: (email as string).toLowerCase(),
      password: hashedPin,
      role: roleResolved,
      zone: (zone as Zone) || "BOGOTA",
      jobTitle: jobTitleCreate,
      teamFilter: teamFilterDefault,
      isActive: activo,
    },
  });

  return NextResponse.json({
    ok: true,
    user: usuario,
  }, { status: 201 });
}
