export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { appendRow } from "@/lib/google-sheets";

/**
 * Auto-asignación de "Disponibilidad" con rotación justa.
 *
 * Lógica:
 *  - Calcula los DOMINGOS y FESTIVOS del mes solicitado.
 *  - Para cada técnico seleccionado consulta su última fecha con tipo=DISPONIBLE
 *    en MallaTurno (todo el histórico de la BD).
 *  - Ordena de "más antiguo / nunca tuvo" → "más reciente". Empate por nombre.
 *  - Round-robin asignando los días disponibles del mes a los técnicos en ese orden.
 *  - Salta días donde el técnico ya tenga un tipo distinto a TRABAJO/DESCANSO
 *    (Vacaciones, Incapacitado, etc.) para evitar pisar novedades.
 *
 * Modos:
 *  - preview: devuelve la propuesta { asignaciones: [{userId, fecha, nombre}] } sin escribir.
 *  - apply:   ejecuta upserts en MallaTurno y sincroniza con Google Sheets.
 */

function dateKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const profile = await getUserProfile(user.email!);
    if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }

    const { userIds, mes, modo } = body as {
      userIds?: string[];
      mes?: string;
      modo?: "preview" | "apply";
    };

    if (!Array.isArray(userIds) || userIds.length === 0 || !mes) {
      return NextResponse.json({ error: "userIds[] y mes (yyyy-MM) requeridos" }, { status: 400 });
    }
    const modoFinal: "preview" | "apply" = modo === "apply" ? "apply" : "preview";

    if (profile.role === "TECNICO") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (profile.role === "COORDINADOR" || profile.role === "SUPPLY") {
      const targets = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, zona: true, role: true, cargo: true },
      });
      const invalido =
        targets.length !== userIds.length ||
        targets.some((t) => {
          if (t.role !== "TECNICO" || t.zona !== profile.zona) return true;
          if (profile.role === "SUPPLY" && t.cargo !== "ALMACENISTA") return true;
          return false;
        });
      if (invalido) {
        return NextResponse.json({ error: "Solo puedes asignar disponibilidad a operadores de tu zona" }, { status: 403 });
      }
    }

    const [year, month] = mes.split("-").map(Number);
    const inicioMes = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const finMes = new Date(Date.UTC(year, month, 0, 23, 59, 59));

    const festivos = await prisma.festivo.findMany({
      where: { fecha: { gte: inicioMes, lte: finMes } },
    });
    const festivoSet = new Set(festivos.map((f) => dateKey(f.fecha)));

    const diasObjetivo: string[] = [];
    const cursor = new Date(inicioMes);
    while (cursor <= finMes) {
      const key = dateKey(cursor);
      const isSunday = cursor.getUTCDay() === 0;
      const isFestivo = festivoSet.has(key);
      if (isSunday || isFestivo) diasObjetivo.push(key);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    if (diasObjetivo.length === 0) {
      return NextResponse.json({ ok: true, asignaciones: [], mensaje: "El mes no tiene domingos ni festivos" });
    }

    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, nombre: true, cedula: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    const ultimas = await prisma.mallaTurno.groupBy({
      by: ["userId"],
      where: {
        userId: { in: userIds },
        tipo: "DISPONIBLE",
      },
      _max: { fecha: true },
    });
    const ultimaPorUser = new Map<string, Date | null>(
      ultimas.map((u) => [u.userId, u._max.fecha ?? null])
    );

    const existentes = await prisma.mallaTurno.findMany({
      where: {
        userId: { in: userIds },
        fecha: { gte: inicioMes, lte: finMes },
      },
      select: { userId: true, fecha: true, tipo: true },
    });
    const TIPOS_BLOQUEAN = new Set([
      "DIA_FAMILIA",
      "INCAPACITADO",
      "VACACIONES",
      "MEDIO_CUMPLE",
    ]);
    const bloqueado = new Set<string>();
    for (const e of existentes) {
      if (e.tipo && TIPOS_BLOQUEAN.has(e.tipo)) {
        bloqueado.add(`${e.userId}|${dateKey(e.fecha)}`);
      }
    }

    type Cola = { userId: string; nombre: string; cedula: string | null; ultima: Date | null };
    const cola: Cola[] = userIds
      .map((uid) => {
        const u = userById.get(uid);
        return {
          userId: uid,
          nombre: u?.nombre ?? "",
          cedula: u?.cedula ?? null,
          ultima: ultimaPorUser.get(uid) ?? null,
        };
      })
      .sort((a, b) => {
        if (a.ultima === null && b.ultima === null) return a.nombre.localeCompare(b.nombre);
        if (a.ultima === null) return -1;
        if (b.ultima === null) return 1;
        const diff = a.ultima.getTime() - b.ultima.getTime();
        if (diff !== 0) return diff;
        return a.nombre.localeCompare(b.nombre);
      });

    type Asignacion = {
      userId: string;
      nombre: string;
      cedula: string | null;
      fecha: string;
      ultimaPrev: string | null;
    };
    const asignaciones: Asignacion[] = [];

    let puntero = 0;
    for (const fecha of diasObjetivo) {
      let asignado: Cola | null = null;
      let saltos = 0;
      while (saltos < cola.length) {
        const candidato = cola[puntero % cola.length];
        if (!bloqueado.has(`${candidato.userId}|${fecha}`)) {
          asignado = candidato;
          puntero = (puntero + 1) % cola.length;
          break;
        }
        puntero = (puntero + 1) % cola.length;
        saltos++;
      }
      if (asignado) {
        asignaciones.push({
          userId: asignado.userId,
          nombre: asignado.nombre,
          cedula: asignado.cedula,
          fecha,
          ultimaPrev: asignado.ultima ? dateKey(asignado.ultima) : null,
        });
      }
    }

    if (modoFinal === "preview") {
      return NextResponse.json({
        ok: true,
        modo: "preview",
        diasObjetivo,
        asignaciones,
        ordenInicial: cola.map((c) => ({
          userId: c.userId,
          nombre: c.nombre,
          ultima: c.ultima ? dateKey(c.ultima) : null,
        })),
      });
    }

    let escritos = 0;
    for (const a of asignaciones) {
      const [y, m, d] = a.fecha.split("-").map(Number);
      const fechaDate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));

      const existente = await prisma.mallaTurno.findUnique({
        where: { userId_fecha: { userId: a.userId, fecha: fechaDate } },
        select: { tipo: true },
      });

      await prisma.mallaTurno.upsert({
        where: { userId_fecha: { userId: a.userId, fecha: fechaDate } },
        update: { tipo: "DISPONIBLE", valor: "disponible" },
        create: { userId: a.userId, fecha: fechaDate, tipo: "DISPONIBLE", valor: "disponible" },
      });
      escritos++;

      if (existente?.tipo !== "DISPONIBLE") {
        appendRow("Disponibilidades", [a.nombre, a.cedula ?? "", a.fecha, 80000]).catch(console.error);
      }
    }

    return NextResponse.json({ ok: true, modo: "apply", escritos, asignaciones });
  } catch (e) {
    console.error("[auto-disponibilidad]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error en auto-disponibilidad" },
      { status: 500 }
    );
  }
}
