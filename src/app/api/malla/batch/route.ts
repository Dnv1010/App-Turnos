export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const profile = await getUserProfile(user.email!);
  if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  try {
    const body = await req.json();
    const { userIds, dates, shiftCode } = body;

    if (!Array.isArray(userIds) || !Array.isArray(dates) || userIds.length === 0 || dates.length === 0) {
      return NextResponse.json({ error: "userIds y dates (arrays no vacíos) requeridos" }, { status: 400 });
    }

    if (profile.role === "TECNICO") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (profile.role === "COORDINADOR" || profile.role === "SUPPLY") {
      const targets = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, zone: true, role: true, jobTitle: true },
      });
      const invalid = targets.some((t) => {
        if (t.role !== "TECNICO" || t.zone !== profile.zone) return true;
        if (profile.role === "SUPPLY" && t.jobTitle !== "ALMACENISTA") return true;
        return false;
      });
      if (invalid || targets.length !== userIds.length) {
        return NextResponse.json({ error: "Solo puedes asignar malla a operadores de tu zona" }, { status: 403 });
      }
    }

    // Construir todas las operaciones y ejecutarlas en paralelo
    const ops: ReturnType<typeof prisma.shiftSchedule.upsert>[] = []
    for (const userId of userIds) {
      for (const dateInput of dates) {
        const fechaStr = typeof dateInput === "string" ? dateInput : String(dateInput);
        const [y, m, d] = fechaStr.split("-").map(Number);
        if (!y || !m || !d) continue;
        const fechaDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
        ops.push(prisma.shiftSchedule.upsert({
          where: { userId_date: { userId, date: fechaDate } },
          update: { shiftCode: shiftCode ?? "" },
          create: { userId, date: fechaDate, shiftCode: shiftCode ?? "" },
        }))
      }
    }
    await Promise.all(ops)
    const count = ops.length

    return NextResponse.json({ ok: true, registros: count });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
