"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { HiPlay, HiStop, HiLocationMarker, HiCamera, HiCheck, HiRefresh } from "react-icons/hi";

async function parseJsonFromResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) throw new Error("Respuesta vacía del servidor");
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("Respuesta inválida del servidor");
  }
}

const CameraCapture = dynamic(() => import("@/components/fotos/CameraCapture"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-gray-500">
      <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      <p className="text-sm font-medium">Cargando cámara...</p>
      <p className="text-xs">Solo se muestra en el cliente (HTTPS)</p>
    </div>
  ),
});

interface BotonFichajeProps {
  userId: string;
  turnoActivo?: { id: string; horaEntrada: string } | null;
  onFichaje: () => void;
}

type Step = "idle" | "camera" | "preview" | "uploading";

export default function BotonFichaje({ userId, turnoActivo, onFichaje }: BotonFichajeProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ubicacion, setUbicacion] = useState<{ lat: number; lng: number } | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isCerrandoTurno, setIsCerrandoTurno] = useState(false);

  const obtenerUbicacion = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error("Geolocalización no disponible")); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUbicacion(coords);
          resolve(coords);
        },
        (err) => reject(new Error(`Error GPS: ${err.message}`)),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  const handleFichajeClick = useCallback(() => {
    setError(null);
    setIsCerrandoTurno(!!turnoActivo);
    setStep("camera");
  }, [turnoActivo]);

  const handleCapture = useCallback((_base64: string, preview: string) => {
    setCapturedPhoto(preview);
    setStep("preview");
  }, []);

  const retakePhoto = useCallback(() => {
    setCapturedPhoto(null);
    setStep("camera");
  }, []);

  const cancelCamera = useCallback(() => {
    setCapturedPhoto(null);
    setStep("idle");
    setIsCerrandoTurno(false);
  }, []);

  const confirmAndSubmit = useCallback(async () => {
    if (!capturedPhoto) return;
    setStep("uploading");
    setLoading(true);
    setError(null);
    try {
      const coords = await obtenerUbicacion();
      const base64Data = capturedPhoto.includes(",") ? capturedPhoto.split(",")[1] : capturedPhoto;

      const fotoRes = await fetch("/api/fotos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          base64Data,
          tipo: isCerrandoTurno ? "SALIDA" : "ENTRADA",
          observaciones: `Fichaje ${isCerrandoTurno ? "salida" : "entrada"} - ${new Date().toLocaleString("es-CO")}`,
        }),
      });
      const fotoData = await parseJsonFromResponse(fotoRes);
      if (!fotoRes.ok) {
        throw new Error((fotoData.error as string) || "Error subiendo foto");
      }
      const photoUrl = (fotoData.driveUrl as string) ?? (fotoData.foto as { driveUrl?: string })?.driveUrl ?? null;

      if (isCerrandoTurno && turnoActivo) {
        const res = await fetch("/api/turnos", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ turnoId: turnoActivo.id, lat: coords.lat, lng: coords.lng, endPhotoUrl: photoUrl }),
        });
        const data = await parseJsonFromResponse(res);
        if (!res.ok) {
          throw new Error((data.error as string) || "Error al cerrar turno");
        }
      } else {
        const res = await fetch("/api/turnos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, lat: coords.lat, lng: coords.lng, startPhotoUrl: photoUrl }),
        });
        const data = await parseJsonFromResponse(res);
        if (!res.ok) {
          throw new Error((data.error as string) || "Error al iniciar turno");
        }
      }

      setCapturedPhoto(null);
      setStep("idle");
      setIsCerrandoTurno(false);
      onFichaje();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setStep("preview");
    } finally {
      setLoading(false);
    }
  }, [capturedPhoto, isCerrandoTurno, turnoActivo, userId, onFichaje]);

  const estaEnTurno = !!turnoActivo;

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm">
      {step === "idle" && (
        <>
          <button
            onClick={handleFichajeClick}
            disabled={loading}
            className={`relative w-40 h-40 rounded-full flex flex-col items-center justify-center text-white font-bold shadow-lg transition-all duration-300 active:scale-95 disabled:opacity-70 ${
              estaEnTurno
                ? "bg-gradient-to-br from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 shadow-red-200"
                : "bg-gradient-to-br from-primary-500 to-primary-700 hover:from-primary-600 hover:to-primary-800 shadow-primary-200"
            }`}
          >
            {estaEnTurno ? (
              <>
                <HiStop className="h-10 w-10 mb-1" />
                <span className="text-sm">Cerrar Turno</span>
              </>
            ) : (
              <>
                <HiPlay className="h-10 w-10 mb-1" />
                <span className="text-sm">Iniciar Turno</span>
              </>
            )}
            {estaEnTurno && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full animate-pulse border-2 border-white" />
            )}
          </button>
          <p className="text-xs text-gray-400 text-center flex items-center gap-1">
            <HiCamera className="h-3.5 w-3.5" />
            Se tomará foto + ubicación GPS
          </p>
        </>
      )}

      {step === "camera" && (
        <div className="w-full bg-white rounded-2xl shadow-lg overflow-hidden p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-600">
              📸 Foto de {isCerrandoTurno ? "salida" : "entrada"}
            </p>
            <button type="button" onClick={cancelCamera} className="text-sm text-gray-500 hover:text-gray-700 underline">
              Cancelar
            </button>
          </div>
          <CameraCapture
            onCapture={handleCapture}
            onCancel={cancelCamera}
          />
        </div>
      )}

      {step === "preview" && capturedPhoto && (
        <div className="w-full bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-primary-600 p-2 text-center">
            <span className="text-white text-xs font-medium">
              ¿Confirmar foto de {isCerrandoTurno ? "salida" : "entrada"}?
            </span>
          </div>
          <div className="rounded-lg overflow-hidden">
            <img src={capturedPhoto} alt="Foto capturada" className="w-full h-auto" />
          </div>
          <div className="flex justify-center gap-3 p-4">
            <button onClick={retakePhoto} className="btn-secondary text-sm px-4 py-2">
              <HiRefresh className="h-4 w-4 mr-1 inline" />Repetir
            </button>
            <button onClick={confirmAndSubmit} className="btn-primary text-sm px-4 py-2">
              <HiCheck className="h-4 w-4 mr-1 inline" />
              {isCerrandoTurno ? "Cerrar Turno" : "Iniciar Turno"}
            </button>
          </div>
        </div>
      )}

      {step === "uploading" && (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-500">
            {isCerrandoTurno ? "Cerrando turno" : "Iniciando turno"} y subiendo foto...
          </p>
        </div>
      )}

      {estaEnTurno && turnoActivo && step === "idle" && (
        <p className="text-sm text-gray-500">
          Turno iniciado: {new Date(turnoActivo.horaEntrada).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
      {ubicacion && step === "idle" && (
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <HiLocationMarker className="h-3 w-3" />
          <span>{ubicacion.lat.toFixed(4)}, {ubicacion.lng.toFixed(4)}</span>
        </div>
      )}
      {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}
    </div>
  );
}
