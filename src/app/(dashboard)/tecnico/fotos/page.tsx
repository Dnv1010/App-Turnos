"use client";

import { useAuth } from "@/lib/auth-provider";
import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { HiPhotograph, HiUpload, HiTruck, HiCamera, HiClipboardList, HiX, HiPencil, HiTrash } from "react-icons/hi";
import { parseResponseJson } from "@/lib/parseFetchJson";
import FotoInput from "@/components/fotos/FotoInput";

const CameraCapture = dynamic(() => import("@/components/fotos/CameraCapture"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-gray-500">
      <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      <p className="text-sm font-medium">Cargando cámara...</p>
      <p className="text-xs">Solo se muestra en el cliente (HTTPS)</p>
    </div>
  ),
});

type TipoFoto = "FORANEO" | "GENERAL" | "ENTRADA" | "SALIDA";
type Tab = "registrar" | "historial";

async function getLocationOptional(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    console.warn("[GPS] Geolocation no disponible");
    return null;
  }
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      });
    });
    console.log("[GPS] Ubicación obtenida:", pos.coords.latitude, pos.coords.longitude);
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch (err) {
    console.warn("[GPS] Error obteniendo ubicación:", err);
    return null;
  }
}

interface FotoRecord {
  id: string;
  tipo: string;
  driveUrl: string | null;
  driveUrlFinal?: string | null;
  kmInicial: number | null;
  kmFinal: number | null;
  observaciones: string | null;
  createdAt: string;
  latInicial?: number | null;
  lngInicial?: number | null;
  latFinal?: number | null;
  lngFinal?: number | null;
}

export default function FotosPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>("registrar");
  const [tipo, setTipo] = useState<TipoFoto>("FORANEO");
  const [kmInicial, setKmInicial] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [loading, setLoading] = useState(false);
  const [exito, setExito] = useState(false);
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [historial, setHistorial] = useState<FotoRecord[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const ahora = new Date();
  const [filtroInicio, setFiltroInicio] = useState(format(startOfMonth(ahora), "yyyy-MM-dd"));
  const [filtroFin, setFiltroFin] = useState(format(endOfMonth(ahora), "yyyy-MM-dd"));
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editKmInicial, setEditKmInicial] = useState("");
  const [editKmFinal, setEditKmFinal] = useState("");
  const [editObservaciones, setEditObservaciones] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [foraneoActivo, setForaneoActivo] = useState<FotoRecord | null>(null);
  const [loadingForaneoActivo, setLoadingForaneoActivo] = useState(false);
  const [pasoFinalFotoBase64, setPasoFinalFotoBase64] = useState<string | null>(null);
  const [pasoFinalFotoPreview, setPasoFinalFotoPreview] = useState<string | null>(null);
  const [showCameraFinal, setShowCameraFinal] = useState(false);
  const [kmFinalPaso2, setKmFinalPaso2] = useState("");
  const [loadingFinalizar, setLoadingFinalizar] = useState(false);

  const cargarForaneoActivo = useCallback(async () => {
    if (!profile?.id) return;
    setLoadingForaneoActivo(true);
    try {
      const res = await fetch(`/api/fotos?activoForaneo=1`);
      if (res.ok) {
        const data = await parseResponseJson<FotoRecord & { id?: string }>(res);
        setForaneoActivo(data && typeof data === "object" && data.id ? (data as FotoRecord) : null);
      }
    } catch { setForaneoActivo(null); }
    finally { setLoadingForaneoActivo(false); }
  }, [profile?.id]);

  const cargarHistorial = useCallback(async () => {
    if (!profile?.id) return;
    setLoadingHistorial(true);
    try {
      const res = await fetch(`/api/fotos?userId=${profile?.id}&inicio=${filtroInicio}&fin=${filtroFin}`);
      if (res.ok) {
        const h = await parseResponseJson<FotoRecord[]>(res);
        setHistorial(Array.isArray(h) ? h : []);
      }
    } catch { /* silently fail */ }
    finally { setLoadingHistorial(false); }
  }, [profile?.id, filtroInicio, filtroFin]);

  useEffect(() => {
    if (tab === "historial") cargarHistorial();
  }, [tab, cargarHistorial]);

  useEffect(() => {
    if (tab === "registrar") cargarForaneoActivo();
  }, [tab, cargarForaneoActivo]);

  const handleCapture = (base64: string, preview: string) => {
    setFotoBase64(base64);
    setFotoPreview(preview);
    setShowCamera(false);
  };

  const handleCaptureFinal = (base64: string, preview: string) => {
    setPasoFinalFotoBase64(base64);
    setPasoFinalFotoPreview(preview);
    setShowCameraFinal(false);
  };

  const handleSubmitIniciarForaneo = async () => {
    if (!fotoBase64 || !profile?.id || !kmInicial.trim()) {
      alert("Captura la foto e ingresa el km inicial.");
      return;
    }
    setLoading(true);
    try {
      const location = await getLocationOptional();
      if (!location) {
        alert(
          "No se pudo obtener la ubicación GPS. Activa el GPS y los permisos de ubicación en tu navegador, luego intenta de nuevo."
        );
        return;
      }
      const res = await fetch("/api/fotos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: profile?.id,
          base64Data: fotoBase64,
          tipo: "FORANEO",
          kmInicial: parseFloat(kmInicial),
          observaciones: observaciones || undefined,
          latInicial: location.lat,
          lngInicial: location.lng,
        }),
      });
      if (res.ok) {
        setExito(true);
        setFotoBase64(null);
        setFotoPreview(null);
        setKmInicial("");
        setObservaciones("");
        setTipo("FORANEO");
        setTimeout(() => setExito(false), 3000);
        await cargarForaneoActivo();
        await cargarHistorial();
      } else {
        const d = await parseResponseJson<{ error?: string }>(res);
        alert(d?.error || "Error al iniciar foráneo");
      }
    } catch { alert("Error de conexión"); }
    finally { setLoading(false); }
  };

  const handleSubmitFinalizarForaneo = async () => {
    if (!foraneoActivo?.id || !profile?.id) return;
    if (!pasoFinalFotoBase64) {
      alert("Captura la foto final.");
      return;
    }
    const kmF = parseFloat(kmFinalPaso2);
    const kmI = foraneoActivo.kmInicial ?? 0;
    if (isNaN(kmF) || kmF <= kmI) {
      alert("El km final debe ser mayor que el km inicial (" + kmI + ").");
      return;
    }
    setLoadingFinalizar(true);
    try {
      const location = await getLocationOptional();
      if (!location) {
        alert("No se pudo obtener la ubicación GPS para finalizar. Activa el GPS e intenta de nuevo.");
        return;
      }
      const res = await fetch(`/api/fotos/${foraneoActivo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kmFinal: kmF,
          base64Data: pasoFinalFotoBase64,
          latFinal: location.lat,
          lngFinal: location.lng,
        }),
      });
      if (res.ok) {
        setExito(true);
        setForaneoActivo(null);
        setPasoFinalFotoBase64(null);
        setPasoFinalFotoPreview(null);
        setKmFinalPaso2("");
        setTimeout(() => setExito(false), 3000);
        await cargarForaneoActivo();
        await cargarHistorial();
      } else {
        const d = await parseResponseJson<{ error?: string }>(res);
        alert(d?.error || "Error al finalizar foráneo");
      }
    } catch { alert("Error de conexión"); }
    finally { setLoadingFinalizar(false); }
  };

  const handleSubmitGeneral = async () => {
    if (!fotoBase64 || !profile?.id) return;
    setLoading(true);
    try {
      const res = await fetch("/api/fotos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: profile?.id,
          base64Data: fotoBase64,
          tipo: "GENERAL",
          observaciones: observaciones || undefined,
        }),
      });
      if (res.ok) {
        setExito(true);
        setFotoBase64(null);
        setFotoPreview(null);
        setObservaciones("");
        setTimeout(() => setExito(false), 3000);
      }
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  };

  const kmRecorridosPreviewPaso2 =
    foraneoActivo?.kmInicial != null && kmFinalPaso2
      ? Math.max(0, parseFloat(kmFinalPaso2) - foraneoActivo.kmInicial)
      : 0;

  const fotosForaneo = historial.filter((f) => f.tipo === "FORANEO");
  const totalKm = fotosForaneo.reduce((sum, f) => {
    if (f.kmInicial != null && f.kmFinal != null) return sum + Math.max(0, f.kmFinal - f.kmInicial);
    return sum;
  }, 0);

  const abrirEditar = (f: FotoRecord) => {
    setEditandoId(f.id);
    setEditKmInicial(f.kmInicial != null ? String(f.kmInicial) : "");
    setEditKmFinal(f.kmFinal != null ? String(f.kmFinal) : "");
    setEditObservaciones(f.observaciones || "");
  };
  const guardarEdicion = async () => {
    if (!editandoId) return;
    setGuardando(true);
    try {
      const res = await fetch(`/api/fotos/${editandoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kmInicial: editKmInicial ? parseFloat(editKmInicial) : undefined,
          kmFinal: editKmFinal ? parseFloat(editKmFinal) : undefined,
          observaciones: editObservaciones || undefined,
        }),
      });
      if (res.ok) {
        setEditandoId(null);
        cargarHistorial();
      } else {
        const d = await parseResponseJson<{ error?: string }>(res);
        alert(d?.error || "Error al guardar");
      }
    } catch { alert("Error de conexión"); }
    finally { setGuardando(false); }
  };
  const eliminarRegistro = async (id: string) => {
    if (!confirm("¿Eliminar este registro foráneo?")) return;
    setEliminandoId(id);
    try {
      const res = await fetch(`/api/fotos/${id}`, { method: "DELETE" });
      if (res.ok) cargarHistorial();
      else alert("No se pudo eliminar");
    } catch { alert("Error de conexión"); }
    finally { setEliminandoId(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Fotos y Kilometraje</h2>
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
          {loadingForaneoActivo ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : foraneoActivo ? (
            <div className="space-y-6">
              <div className="card bg-orange-50 border border-orange-200">
                <h3 className="text-lg font-semibold text-orange-900 mb-2">Foráneo activo</h3>
                <p className="text-sm text-orange-800">
                  Km inicial: <strong>{foraneoActivo.kmInicial}</strong> — Inicio:{" "}
                  {new Date(foraneoActivo.createdAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                </p>
                {foraneoActivo.driveUrl && (
                  <a href={foraneoActivo.driveUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-orange-700 underline mt-1 inline-block">
                    Ver foto inicial en Drive
                  </a>
                )}
              </div>

              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Paso 2 — Finalizar foráneo</h3>
              {!pasoFinalFotoBase64 && !showCameraFinal && (
                <div className="card">
                  <p className="text-sm text-gray-600 mb-4">Captura la foto final y ingresa el km final (debe ser mayor que el km inicial).</p>
                  <button
                    type="button"
                    onClick={() => setShowCameraFinal(true)}
                    className="btn-primary flex items-center gap-2"
                  >
                    <HiCamera className="h-5 w-5" /> Capturar foto final
                  </button>
                </div>
              )}
              {showCameraFinal && !pasoFinalFotoBase64 && (
                <FotoInput
                  onCapture={(b, p) => { setPasoFinalFotoBase64(b); setPasoFinalFotoPreview(p); }}
                  disabled={loadingFinalizar}
                  label="Foto final del foráneo"
                />
              )}
              {pasoFinalFotoBase64 && pasoFinalFotoPreview && (
                <div className="max-w-lg space-y-4">
                  <div className="card p-0 overflow-hidden relative">
                    <img src={pasoFinalFotoPreview} alt="Foto final" className="w-full h-auto" />
                    <button
                      type="button"
                      onClick={() => { setPasoFinalFotoBase64(null); setPasoFinalFotoPreview(null); }}
                      className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70"
                      aria-label="Quitar foto"
                    >
                      <HiX className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="card space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Km final</label>
                      <input
                        type="number"
                        value={kmFinalPaso2}
                        onChange={(e) => setKmFinalPaso2(e.target.value)}
                        className="input-field"
                        placeholder={`Mayor que ${foraneoActivo.kmInicial ?? ""}`}
                      />
                    </div>
                    {kmRecorridosPreviewPaso2 > 0 && (
                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
                        <span className="text-sm text-orange-800 font-medium">
                          Km recorridos: <strong>{kmRecorridosPreviewPaso2.toFixed(1)} km</strong>
                        </span>
                      </div>
                    )}
                    <div className="flex gap-3">
                      <button type="button" onClick={() => { setPasoFinalFotoBase64(null); setPasoFinalFotoPreview(null); setKmFinalPaso2(""); }} className="btn-secondary flex-1">
                        Cancelar
                      </button>
                      <button onClick={handleSubmitFinalizarForaneo} disabled={loadingFinalizar} className="btn-primary flex-1 flex items-center justify-center gap-2">
                        {loadingFinalizar ? (
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <><HiUpload className="h-5 w-5" /> Finalizar Foráneo</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : !fotoBase64 && !showCamera ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => { setTipo("FORANEO"); setShowCamera(true); }}
                className="card hover:shadow-md transition-shadow cursor-pointer flex flex-col items-center gap-3 py-8"
              >
                <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center">
                  <HiTruck className="h-8 w-8 text-orange-600" />
                </div>
                <span className="font-semibold text-gray-900 dark:text-white">Iniciar Foráneo</span>
                <span className="text-xs text-gray-500 text-center">Foto inicial + km inicial del vehículo</span>
              </button>
              <button
                onClick={() => { setTipo("GENERAL"); setShowCamera(true); }}
                className="card hover:shadow-md transition-shadow cursor-pointer flex flex-col items-center gap-3 py-8"
              >
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
                  <HiPhotograph className="h-8 w-8 text-blue-600" />
                </div>
                <span className="font-semibold text-gray-900 dark:text-white">Foto General</span>
                <span className="text-xs text-gray-500 text-center">Foto de trabajo en campo</span>
              </button>
            </div>
          ) : showCamera && !fotoBase64 ? (
            tipo === "FORANEO" ? (
              <FotoInput
                onCapture={handleCapture}
                disabled={loading}
                label="Foto inicial del foráneo"
              />
            ) : (
              <CameraCapture onCapture={handleCapture} onCancel={() => setShowCamera(false)} />
            )
          ) : fotoBase64 && fotoPreview ? (
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
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {tipo === "FORANEO" ? "Paso 1 — Iniciar Foráneo" : "Foto General"}
                </h3>
                {tipo === "FORANEO" && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Km inicial</label>
                      <input type="number" value={kmInicial} onChange={(e) => setKmInicial(e.target.value)} className="input-field" placeholder="Ej: 45230" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones (opcional)</label>
                      <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className="input-field" rows={2} placeholder="Descripción..." />
                    </div>
                    <div className="flex gap-3">
                      <button type="button" onClick={() => { setFotoBase64(null); setFotoPreview(null); setShowCamera(false); }} className="btn-secondary flex-1">Cancelar</button>
                      <button onClick={handleSubmitIniciarForaneo} disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
                        {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><HiUpload className="h-5 w-5" /> Iniciar Foráneo</>}
                      </button>
                    </div>
                  </>
                )}
                {tipo === "GENERAL" && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones (opcional)</label>
                      <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className="input-field" rows={3} placeholder="Descripción..." />
                    </div>
                    <div className="flex gap-3">
                      <button type="button" onClick={() => { setFotoBase64(null); setFotoPreview(null); setShowCamera(false); }} className="btn-secondary flex-1">Cancelar</button>
                      <button onClick={handleSubmitGeneral} disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
                        {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><HiUpload className="h-5 w-5" /> Guardar y Subir</>}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </>
      )}

      {tab === "historial" && (
        <>
          <div className="card grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
              <input type="date" value={filtroInicio} onChange={(e) => setFiltroInicio(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
              <input type="date" value={filtroFin} onChange={(e) => setFiltroFin(e.target.value)} className="input-field" />
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <button type="button" onClick={cargarHistorial} disabled={loadingHistorial} className="btn-primary flex items-center gap-2">
                {loadingHistorial ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <HiCamera className="h-4 w-4" />}
                Filtrar
              </button>
            </div>
          </div>
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
                  {editandoId === foto.id ? (
                    <div className="flex-1 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-0.5">Km Inicial</label>
                          <input type="number" value={editKmInicial} onChange={(e) => setEditKmInicial(e.target.value)} className="input-field text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-0.5">Km Final</label>
                          <input type="number" value={editKmFinal} onChange={(e) => setEditKmFinal(e.target.value)} className="input-field text-sm" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-0.5">Observaciones</label>
                        <textarea value={editObservaciones} onChange={(e) => setEditObservaciones(e.target.value)} className="input-field text-sm" rows={2} />
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={guardarEdicion} disabled={guardando} className="btn-primary text-sm px-3 py-1.5">
                          {guardando ? "Guardando…" : "Guardar"}
                        </button>
                        <button type="button" onClick={() => setEditandoId(null)} className="btn-secondary text-sm px-3 py-1.5">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            foto.tipo === "FORANEO" ? "bg-orange-100 text-orange-700" :
                            foto.tipo === "ENTRADA" ? "bg-green-100 text-green-700" :
                            foto.tipo === "SALIDA" ? "bg-red-100 text-red-700" :
                            "bg-blue-100 text-blue-700"
                          }`}>
                            {foto.tipo === "FORANEO" ? "Foráneo" : foto.tipo === "ENTRADA" ? "Entrada" : foto.tipo === "SALIDA" ? "Salida" : "General"}
                          </span>
                          {foto.tipo === "FORANEO" && (
                            <span
                              className="text-xs"
                              title={
                                (foto.latInicial != null && foto.lngInicial != null) || (foto.latFinal != null && foto.lngFinal != null)
                                  ? "Registro con coordenadas GPS"
                                  : "Sin coordenadas GPS guardadas"
                              }
                            >
                              {(foto.latInicial != null && foto.lngInicial != null) || (foto.latFinal != null && foto.lngFinal != null) ? (
                                <span className="text-green-700 dark:text-green-400">📍</span>
                              ) : (
                                <span className="text-amber-700 dark:text-amber-400">⚠️ Sin GPS</span>
                              )}
                            </span>
                          )}
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
                      <div className="flex flex-wrap items-center gap-2">
                        {foto.driveUrl && (
                          <a href={foto.driveUrl} target="_blank" rel="noopener noreferrer"
                            className="btn-secondary text-xs px-3 py-1.5 whitespace-nowrap">
                            {foto.tipo === "FORANEO" && (foto as FotoRecord).driveUrlFinal ? "Foto inicial" : "Ver en Drive"}
                          </a>
                        )}
                        {foto.tipo === "FORANEO" && (foto as FotoRecord).driveUrlFinal && (
                          <a href={(foto as FotoRecord).driveUrlFinal!} target="_blank" rel="noopener noreferrer"
                            className="btn-secondary text-xs px-3 py-1.5 whitespace-nowrap">
                            Foto final
                          </a>
                        )}
                        {foto.tipo === "FORANEO" && (
                          <>
                            <button type="button" onClick={() => abrirEditar(foto)} className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg" title="Editar">
                              <HiPencil className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => eliminarRegistro(foto.id)} disabled={eliminandoId === foto.id} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Eliminar">
                              {eliminandoId === foto.id ? <div className="w-4 h-4 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" /> : <HiTrash className="h-4 w-4" />}
                            </button>
                          </>
                        )}
                      </div>
                    </>
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
