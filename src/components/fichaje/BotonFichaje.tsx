"use client";

import { useState, useCallback } from "react";
import { HiPlay, HiStop, HiLocationMarker } from "react-icons/hi";

interface BotonFichajeProps {
  userId: string;
  turnoActivo?: { id: string; horaEntrada: string } | null;
  onFichaje: () => void;
}

export default function BotonFichaje({ userId, turnoActivo, onFichaje }: BotonFichajeProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ubicacion, setUbicacion] = useState<{ lat: number; lng: number } | null>(null);

  const obtenerUbicacion = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error("Geolocalización no disponible")); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => { const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }; setUbicacion(coords); resolve(coords); },
        (err) => reject(new Error(`Error GPS: ${err.message}`)),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  const handleFichaje = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const coords = await obtenerUbicacion();
      if (turnoActivo) {
        const res = await fetch("/api/turnos", { method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ turnoId: turnoActivo.id, lat: coords.lat, lng: coords.lng }) });
        if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Error al cerrar turno"); }
      } else {
        const res = await fetch("/api/turnos", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, lat: coords.lat, lng: coords.lng }) });
        if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Error al iniciar turno"); }
      }
      onFichaje();
    } catch (err) { setError(err instanceof Error ? err.message : "Error desconocido"); }
    finally { setLoading(false); }
  }, [turnoActivo, userId, onFichaje]);

  const estaEnTurno = !!turnoActivo;

  return (
    <div className="flex flex-col items-center gap-4">
      <button onClick={handleFichaje} disabled={loading}
        className={`relative w-40 h-40 rounded-full flex flex-col items-center justify-center text-white font-bold shadow-lg transition-all duration-300 active:scale-95 disabled:opacity-70 ${estaEnTurno ? "bg-gradient-to-br from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 shadow-red-200" : "bg-gradient-to-br from-primary-500 to-primary-700 hover:from-primary-600 hover:to-primary-800 shadow-primary-200"}`}>
        {loading ? (
          <div className="w-8 h-8 border-3 border-white/30 border-t-white rounded-full animate-spin" />
        ) : estaEnTurno ? (
          <><HiStop className="h-10 w-10 mb-1" /><span className="text-sm">Cerrar Turno</span></>
        ) : (
          <><HiPlay className="h-10 w-10 mb-1" /><span className="text-sm">Iniciar Turno</span></>
        )}
        {estaEnTurno && !loading && <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full animate-pulse border-2 border-white" />}
      </button>
      {estaEnTurno && turnoActivo && (
        <p className="text-sm text-gray-500">Turno iniciado: {new Date(turnoActivo.horaEntrada).toLocaleTimeString("es-CO")}</p>
      )}
      {ubicacion && (
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <HiLocationMarker className="h-3 w-3" />
          <span>{ubicacion.lat.toFixed(4)}, {ubicacion.lng.toFixed(4)}</span>
        </div>
      )}
      {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}
    </div>
  );
}
