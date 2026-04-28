export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Role, Zone } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureWebPushConfigured, webpush } from "@/lib/web-push-config";
import { getAlertaJornadaAt, mensajeCuerpoOperador15min, primerNombreOperador } from "@/lib/jornada-alerta";

function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "development") return true;
    return false;
  }
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

type OperadorAvisado = { nombre: string; cargo: string };

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!ensureWebPushConfigured()) {
    return NextResponse.json({ error: "VAPID no configurado", skipped: true }, { status: 200 });
  }

  const now = new Date();
  const open = await prisma.shift.findMany({
    where: { clockOutAt: null, workdayAlertSentAt: null },
    select: {
      id: true,
      userId: true,
      clockInAt: true,
      user: { select: { fullName: true, zone: true, jobTitle: true } },
    },
  });

  let sent = 0;
  let errors = 0;
  /** Zona → operadores (por userId) a quienes se envió push con éxito */
  const avisadosPorZona = new Map<string, Map<string, OperadorAvisado>>();

  for (const turno of open) {
    const alertAt = getAlertaJornadaAt(turno.clockInAt);
    if (now < alertAt) continue;

    const subs = await prisma.pushSubscription.findMany({
      where: { userId: turno.userId },
    });

    const pn = primerNombreOperador(turno.user.fullName);
    const payload = JSON.stringify({
      title: "⏰ Jornada por finalizar",
      body: mensajeCuerpoOperador15min(pn),
      url: "/tecnico",
      tag: "jornada-alerta",
    });

    if (subs.length === 0) {
      await prisma.shift.update({
        where: { id: turno.id },
        data: { workdayAlertSentAt: now },
      });
      continue;
    }

    let anyOk = false;
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          payload,
          { TTL: 3600, urgency: "high" }
        );
        anyOk = true;
      } catch (e: unknown) {
        errors += 1;
        const status = typeof e === "object" && e && "statusCode" in e ? (e as { statusCode: number }).statusCode : 0;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        }
        console.error("[cron jornada-alerta] push operador falló:", e);
      }
    }

    if (anyOk || subs.length === 0) {
      await prisma.shift.update({
        where: { id: turno.id },
        data: { workdayAlertSentAt: now },
      });
    }
    if (anyOk) {
      sent += 1;
      const zona = turno.user.zone;
      if (!avisadosPorZona.has(zona)) avisadosPorZona.set(zona, new Map());
      avisadosPorZona.get(zona)!.set(turno.userId, {
        nombre: turno.user.fullName,
        cargo: turno.user.jobTitle,
      });
    }
  }

  let enviadosLider = 0;
  let erroresLider = 0;

  for (const [zona, porUserId] of Array.from(avisadosPorZona.entries())) {
    const lista = Array.from(porUserId.values());

    const lideres = await prisma.user.findMany({
      where: {
        zone: zona as Zone,
        role: { in: [Role.COORDINADOR, Role.COORDINADOR_INTERIOR, Role.SUPPLY] },
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        teamFilter: true,
        pushSubscriptions: {
          select: { id: true, endpoint: true, p256dh: true, auth: true },
        },
      },
    });

    for (const lider of lideres) {
      if (!lider.pushSubscriptions.length) continue;

      const filtro = lider.teamFilter || "TODOS";
      const operadoresFiltrados = lista.filter((op) => {
        if (!filtro || filtro === "TODOS") return true;
        return op.cargo === filtro;
      });
      if (operadoresFiltrados.length === 0) continue;

      const nombres = Array.from(new Set(operadoresFiltrados.map((o) => o.nombre)));

      const saludoLider = primerNombreOperador(lider.fullName);
      let bodyLider: string;
      if (nombres.length === 1) {
        bodyLider = `Hola ${saludoLider}, te informamos que el operador ${nombres[0]} acaba de recibir su aviso de 15 minutos para el cierre de su jornada. Ya debería estar pausando actividades y organizando su salida.`;
      } else {
        bodyLider = `Hola ${saludoLider}, te informamos que los siguientes operadores acaban de recibir su aviso de 15 minutos: ${nombres.join(", ")}. Ya deberían estar pausando actividades y organizando su salida.`;
      }

      const payloadLider = JSON.stringify({
        title: `📋 Aviso de cierre — ${nombres.length} operador${nombres.length > 1 ? "es" : ""}`,
        body: bodyLider,
        url: "/coordinador",
        tag: `jornada-alerta-lider-${zona}`,
      });

      let liderOk = false;
      for (const s of lider.pushSubscriptions) {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint,
              keys: { p256dh: s.p256dh, auth: s.auth },
            },
            payloadLider,
            { TTL: 3600, urgency: "high" }
          );
          liderOk = true;
        } catch (err: unknown) {
          erroresLider += 1;
          const status = typeof err === "object" && err && "statusCode" in err ? (err as { statusCode: number }).statusCode : 0;
          if (status === 404 || status === 410) {
            await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
          }
          console.error(`[cron jornada-alerta] push líder ${lider.fullName}:`, err);
        }
      }
      if (liderOk) enviadosLider += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    revisados: open.length,
    enviados: sent,
    erroresPush: errors,
    enviadosLider,
    erroresPushLider: erroresLider,
  });
}
