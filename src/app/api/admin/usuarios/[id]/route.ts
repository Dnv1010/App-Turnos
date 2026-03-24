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

const ROLES: Role[] = ["ADMIN", "MANAGER", "COORDINADOR", "COORDINADOR_INTERIOR", "TECNICO"];
const ZONAS: Zona[] = ["BOGOTA", "COSTA", "INTERIOR"];
const FILTROS_EQUIPO = ["TODOS", "TECNICO", "ALMACENISTA"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verificarAdmin();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }

  const { nombre, email, cedula, pin, role, zona, isActive, cargo, filtroEquipo } = body;

  const data: {
    nombre?: string;
    email?: string;
    cedula?: string;
    password?: string;
    role?: Role;
    zona?: Zona;
    isActive?: boolean;
    cargo?: Cargo;
    filtroEquipo?: string;
  } = {};

  if (typeof nombre === "string" && nombre.trim()) data.nombre = nombre.trim();
  if (typeof email === "string" && email.trim()) data.email = email.trim().toLowerCase();
  if (typeof cedula === "string" && cedula.trim()) data.cedula = cedula.trim();
  if (typeof pin === "string" && pin.trim() !== "") {
    const pinStr = pin.trim();
    if (pinStr.length !== 4) {
      return NextResponse.json({ error: "El PIN debe tener 4 dígitos" }, { status: 400 });
    }
    data.password = await bcrypt.hash(pinStr, 10);
  }
  if (typeof role === "string" && ROLES.includes(role as Role)) data.role = role as Role;
  if (typeof zona === "string" && ZONAS.includes(zona as Zona)) data.zona = zona as Zona;
  if (typeof isActive === "boolean") data.isActive = isActive;
  if (typeof cargo === "string" && Object.values(Cargo).includes(cargo as Cargo)) data.cargo = cargo as Cargo;
  if (typeof filtroEquipo === "string" && FILTROS_EQUIPO.includes(filtroEquipo as (typeof FILTROS_EQUIPO)[number])) {
    data.filtroEquipo = filtroEquipo;
  }

  try {
    const usuario = await prisma.user.update({ where: { id }, data });
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
    });
  } catch (e) {
    console.error("[admin usuarios PATCH]", e);
    return NextResponse.json({ error: "Error al actualizar usuario" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verificarAdmin();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  try {
    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin usuarios DELETE]", e);
    return NextResponse.json({ error: "Error al desactivar usuario" }, { status: 500 });
  }
}
