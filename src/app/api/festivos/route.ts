export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerSupabase } from "@/lib/supabase-server";

function dateKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const inicio = searchParams.get("inicio");
  const fin = searchParams.get("fin");

  if (!inicio || !fin) {
    return NextResponse.json({ error: "inicio y fin (YYYY-MM-DD) requeridos" }, { status: 400 });
  }

  const [yi, mi, di] = inicio.split("-").map(Number);
  const [yf, mf, df] = fin.split("-").map(Number);
  const fechaInicio = new Date(Date.UTC(yi, mi - 1, di, 0, 0, 0));
  const fechaFin = new Date(Date.UTC(yf, mf - 1, df, 23, 59, 59));

  const festivos = await prisma.festivo.findMany({
    where: { fecha: { gte: fechaInicio, lte: fechaFin } },
    select: { fecha: true },
  });

  const festivosKeys = festivos.map((f) => dateKey(f.fecha));
  return NextResponse.json({ festivos: festivosKeys });
}
