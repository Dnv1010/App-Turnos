"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import CameraCapture from "@/components/fotos/CameraCapture";
import { HiPhotograph, HiUpload, HiTruck, HiCamera, HiClipboardList, HiX } from "react-icons/hi";

type TipoFoto = "FORANEO" | "GENERAL" | "ENTRADA" | "SALIDA";
type Tab = "registrar" | "historial";

interface FotoRecord {
  id: string;
  tipo: string;
  driveUrl: string | null;
  kmInicial: number | null;
  kmFinal: number | null;
  observaciones: string | null;
  createdAt: string;
}

export default function FotosPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<Tab>("registrar");
  const [tipo, setTipo] = useState<TipoFoto>("FORANEO");
  const [kmInicial, setKmInicial] = useState("");
  const [kmFinal, setKmFinal] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [loading, setLoading] = useState(false);
  const [exito, setExito] = useState(false);
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [historial, setHistorial] = useState<FotoRecord[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  const cargarHistorial = useCallback(async () => {
    if (!session?.user?.userId) return;
    setLoadingHistorial(true);
    try {
      const res = await fetch(`/api/fotos?userId=${session.user.userId}`);
      if (res.ok) setHistorial(await res.json());
    } catch { /* silently fail */ }
    finally { setLoadingHistorial(false); }
  }, [session?.user?.userId]);

  useEffect(() => {
    if (tab === "historial") cargarHistorial();
  }, [tab, cargarHistorial]);

  const handleCapture = (base64: string, preview: string) => {
    setFotoBase64(base64);
    setFotoPreview(preview);
    setShowCamera(false);
  };

  const handleSubmit = async () => {
    if (!fotoBase64 || !session?.user?.userId) return;
    if (tipo === "FORANEO" && (!kmInicial || !kmFinal)) {
      alert("Para registros foráneos, ingresa el km inicial y final.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/fotos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.user.userId,
          base64Data: fotoBase64,
          tipo,
          kmInicial: kmInicial || undefined,
          kmFinal: kmFinal || undefined,
          observaciones: observaciones || undefined,
        }),
      });
      if (res.ok) {
        setExito(true);
        setFotoBase64(null);
        setFotoPreview(null);
        setKmInicial("");
        setKmFinal("");
        setObservaciones("");
        setTimeout(() => setExito(false), 3000);
      }
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  };

  const kmRecorridosPreview = kmInicial && kmFinal ? Math.max(0, parseFloat(kmFinal) - parseFloat(kmInicial)) : 0;

  const fotosForaneo = historial.filter((f) => f.tipo === "FORANEO");
  const totalKm = fotosForaneo.reduce((sum, f) => {
    if (f.kmInicial != null && f.kmFinal != null) return sum + Math.max(0, f.kmFinal - f.kmInicial);
    return sum;
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Fotos y Kilometraje</h2>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setTab("registrar")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === "registrar" ? "border-primary-600 text-primary-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          <HiCamera className="h-4 w-4 inline mr-1.5" />Nuevo Registro
        </button>
        <button
          onClick={() => setTab("historial")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === "historial" ? "border-primary-600 text-primary-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          <HiClipboardList className="h-4 w-4 inline mr-1.5" />Historial
        </button>
      </div>

      {exito && <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg text-sm">Registro guardado y foto subida a Google Drive</div>}

      {tab === "registrar" && (
        <>
          {!fotoBase64 && !showCamera && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => { setTipo("FORANEO"); setShowCamera(true); }}
                className="card hover:shadow-md transition-shadow cursor-pointer flex flex-col items-center gap-3 py-8"
              >
                <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center">
                  <HiTruck className="h-8 w-8 text-orange-600" />
                </div>
                <span className="font-semibold text-gray-900">Registro Foráneo</span>
                <span className="text-xs text-gray-500 text-center">Foto + km inicial/final del vehículo</span>
              </button>
              <button
                onClick={() => { setTipo("GENERAL"); setShowCamera(true); }}
                className="card hover:shadow-md transition-shadow cursor-pointer flex flex-col items-center gap-3 py-8"
              >
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
                  <HiPhotograph className="h-8 w-8 text-blue-600" />
                </div>
                <span className="font-semibold text-gray-900">Foto General</span>
                <span className="text-xs text-gray-500 text-center">Foto de trabajo en campo</span>
              </button>
            </div>
          )}

          {showCamera && !fotoBase64 && (
            <CameraCapture onCapture={handleCapture} onCancel={() => setShowCamera(false)} />
          )}

          {fotoBase64 && fotoPreview && (
            <div className="max-w-lg mx-auto space-y-4">
              <div className="card p-0 overflow-hidden relative">
                <img src={fotoPreview} alt="Foto capturada" className="w-full h-auto" />
                <button
                  type="button"
                  onClick={() => { setFotoBase64(null); setFotoPreview(null); setShowCamera(false); }}
                  className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70"
                  aria-label="Quitar foto"
                >
                  <HiX className="w-4 h-4" />
                </button>
              </div>
              <div className="card space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {tipo === "FORANEO" ? "Registro Foráneo" : "Foto General"}
                </h3>

                {tipo === "FORANEO" && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Km Inicial</label>
                        <input type="number" value={kmInicial} onChange={(e) => setKmInicial(e.target.value)}
                          className="input-field" placeholder="Ej: 45230" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Km Final</label>
                        <input type="number" value={kmFinal} onChange={(e) => setKmFinal(e.target.value)}
                          className="input-field" placeholder="Ej: 45310" />
                      </div>
                    </div>
                    {kmRecorridosPreview > 0 && (
                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
                        <span className="text-sm text-orange-800 font-medium">
                          Km recorridos: <strong>{kmRecorridosPreview.toFixed(1)} km</strong>
                        </span>
                      </div>
                    )}
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
                  <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
                    className="input-field" rows={3} placeholder="Descripción de la visita o trabajo..." />
                </div>

                <div className="flex gap-3">
                  <button type="button" onClick={() => { setFotoBase64(null); setFotoPreview(null); setShowCamera(false); }} className="btn-secondary flex-1">
                    Cancelar
                  </button>
                  <button onClick={handleSubmit} disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <><HiUpload className="h-5 w-5" />Guardar y Subir</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "historial" && (
        <>
          {fotosForaneo.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="card bg-orange-50 border-orange-200">
                <p className="text-xs text-orange-600 font-medium uppercase">Total Km Recorridos</p>
                <p className="text-2xl font-bold text-orange-800 mt-1">{totalKm.toFixed(1)} km</p>
              </div>
              <div className="card bg-blue-50 border-blue-200">
                <p className="text-xs text-blue-600 font-medium uppercase">Registros Foráneos</p>
                <p className="text-2xl font-bold text-blue-800 mt-1">{fotosForaneo.length}</p>
              </div>
              <div className="card bg-gray-50 border-gray-200">
                <p className="text-xs text-gray-600 font-medium uppercase">Total Registros</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{historial.length}</p>
              </div>
            </div>
          )}

          {loadingHistorial ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : historial.length === 0 ? (
            <div className="card text-center py-12">
              <HiPhotograph className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No hay registros aún</p>
            </div>
          ) : (
            <div className="space-y-3">
              {historial.map((foto) => (
                <div key={foto.id} className="card flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        foto.tipo === "FORANEO" ? "bg-orange-100 text-orange-700" :
                        foto.tipo === "ENTRADA" ? "bg-green-100 text-green-700" :
                        foto.tipo === "SALIDA" ? "bg-red-100 text-red-700" :
                        "bg-blue-100 text-blue-700"
                      }`}>
                        {foto.tipo === "FORANEO" ? "Foráneo" : foto.tipo === "ENTRADA" ? "Entrada" : foto.tipo === "SALIDA" ? "Salida" : "General"}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(foto.createdAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {foto.tipo === "FORANEO" && foto.kmInicial != null && foto.kmFinal != null && (
                      <p className="text-sm text-gray-700">
                        <strong>{Math.max(0, foto.kmFinal - foto.kmInicial).toFixed(1)} km</strong>
                        <span className="text-gray-400"> ({foto.kmInicial} → {foto.kmFinal})</span>
                      </p>
                    )}
                    {foto.observaciones && <p className="text-sm text-gray-500 mt-1">{foto.observaciones}</p>}
                  </div>
                  {foto.driveUrl && (
                    <a href={foto.driveUrl} target="_blank" rel="noopener noreferrer"
                      className="btn-secondary text-xs px-3 py-1.5 whitespace-nowrap">
                      Ver en Drive
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
