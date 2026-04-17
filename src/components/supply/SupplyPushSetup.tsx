"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { HiBell } from "react-icons/hi";
import { pushSupported, urlBase64ToUint8Array } from "@/lib/push-client";
import { parseResponseJson } from "@/lib/parseFetchJson";
import { SERVICE_WORKER_SCRIPT } from "@/lib/service-worker-url";

type Status = "idle" | "loading" | "ok" | "err";

function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

/**
 * Auto-suscripción push para Supply (mismo flujo que CoordinadorPushSetup).
 */
export default function SupplyPushSetup() {
  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const autoStartedRef = useRef(false);
  const everFailedRef = useRef(false);

  const activar = useCallback(async (opts?: { skipPermissionPrompt?: boolean }) => {
    setStatus("loading");
    setMsg(null);
    try {
      const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapid) {
        everFailedRef.current = true;
        setMsg("Falta configurar notificaciones en el servidor.");
        setStatus("err");
        return;
      }

      if (opts?.skipPermissionPrompt) {
        if (Notification.permission !== "granted") {
          everFailedRef.current = true;
          setMsg("Permiso de notificaciones no concedido.");
          setStatus("err");
          return;
        }
      } else {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          everFailedRef.current = true;
          setMsg("Debes permitir notificaciones en el navegador.");
          setStatus("err");
          return;
        }
      }

      const reg = await navigator.serviceWorker.register(SERVICE_WORKER_SCRIPT, {
        scope: "/",
        updateViaCache: "none",
      });
      await reg.update();
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid) as unknown as BufferSource,
      });
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Suscripción incompleta");
      }
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        }),
      });
      const data = await parseResponseJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "No se pudo guardar la suscripción");
      }
      everFailedRef.current = false;
      setStatus("ok");
      setMsg(null);
    } catch (e: unknown) {
      everFailedRef.current = true;
      setStatus("err");
      setMsg(e instanceof Error ? e.message : "Error al activar avisos");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !pushSupported()) return;
    if (autoStartedRef.current) return;
    const perm = Notification.permission;
    if (perm === "denied") return;
    autoStartedRef.current = true;
    void activar(perm === "granted" ? { skipPermissionPrompt: true } : undefined);
  }, [activar]);

  if (!pushSupported()) return null;

  const perm = getNotificationPermission();
  if (perm === "unsupported") return null;

  if (status === "ok") return null;

  if (perm === "denied") {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/30 px-3 py-2 text-sm text-yellow-900 dark:text-yellow-100">
        Para recibir alertas de almacenistas, activa las notificaciones en Ajustes del navegador.
      </div>
    );
  }

  const showRetryCard = status === "err" || (status === "loading" && everFailedRef.current);
  if (showRetryCard) {
    return (
      <div className="card p-4 border border-blue-200 bg-blue-50/50 dark:border-[#3A4565] dark:bg-[#1A2340]/80 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1">
          <HiBell className="h-6 w-6 text-blue-600 dark:text-[#60A5FA] flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-gray-900 dark:text-white">No se pudieron activar los avisos</p>
            <p className="text-sm text-gray-600 dark:text-[#A0AEC0] mt-1">
              Reintenta o comprueba la conexión. En <strong>iOS</strong> añade la app a la pantalla de inicio (PWA).
            </p>
            {msg && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{msg}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void activar()}
          disabled={status === "loading"}
          className="btn-primary whitespace-nowrap shrink-0"
        >
          {status === "loading" ? "Activando…" : "Reintentar"}
        </button>
      </div>
    );
  }

  return null;
}
