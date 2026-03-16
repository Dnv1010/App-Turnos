"use client";

import { useState, useRef, useCallback } from "react";
import { HiCamera, HiRefresh, HiCheck, HiX, HiUpload, HiSwitchHorizontal } from "react-icons/hi";

interface CameraCaptureProps {
  onCapture: (base64OrDataUrl: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
}

export default function CameraCapture({ onCapture, onCancel, disabled }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [streaming, setStreaming] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async (facing: "environment" | "user" = facingMode) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setError(null);
    setCameraReady(false);
    setCameraLoading(true);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await new Promise<void>((resolve) => {
        video.onloadeddata = () => resolve();
      });
      await video.play();
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      setStreaming(true);
      setCameraReady(true);
      setFacingMode(facing);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError("No se pudo acceder a la cámara. Asegúrate de estar en HTTPS y dar permisos de cámara. " + msg);
    } finally {
      setCameraLoading(false);
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setStreaming(false);
    setCameraReady(false);
  }, []);

  const switchCamera = useCallback(() => {
    const next = facingMode === "environment" ? "user" : "environment";
    startCamera(next);
  }, [facingMode, startCamera]);

  const takePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    let w = video.videoWidth;
    let h = video.videoHeight;
    if (w === 0 || h === 0) {
      const rect = video.getBoundingClientRect();
      w = Math.floor(rect.width * (window.devicePixelRatio || 1));
      h = Math.floor(rect.height * (window.devicePixelRatio || 1));
    }
    if (w === 0 || h === 0) {
      w = 640;
      h = 480;
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setCaptured(dataUrl);
    stopCamera();
  }, [stopCamera]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("La imagen es muy grande. Máximo 10MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      onCapture(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [onCapture]);

  const retake = useCallback(() => { setCaptured(null); startCamera(); }, [startCamera]);
  const confirm = useCallback(() => { if (captured) { onCapture(captured); setCaptured(null); } }, [captured, onCapture]);
  const handleCancel = useCallback(() => { stopCamera(); setCaptured(null); onCancel?.(); }, [stopCamera, onCancel]);

  return (
    <div className="card">
      <canvas ref={canvasRef} className="hidden" />
      {cameraLoading && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          <p className="text-gray-500 text-center">Activando cámara...</p>
        </div>
      )}
      {!cameraLoading && !streaming && !captured && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="w-20 h-20 bg-primary-50 rounded-full flex items-center justify-center">
            <HiCamera className="h-10 w-10 text-primary-600" />
          </div>
          <p className="text-gray-500 text-center">Toma una foto o sube una imagen</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <button onClick={() => startCamera()} disabled={disabled} className="btn-primary inline-flex items-center gap-2">
              <HiCamera className="h-5 w-5" /> Abrir cámara
            </button>
            <label className="btn-secondary inline-flex items-center gap-2 cursor-pointer">
              <HiUpload className="h-5 w-5" /> Subir foto
              <input type="file" accept="image/*" capture="environment" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}
        </div>
      )}
      {!cameraLoading && streaming && (
        <div className="space-y-4">
          <div className="relative rounded-lg overflow-hidden bg-black">
            <video ref={videoRef} autoPlay playsInline muted style={{ display: "block", width: "100%", maxWidth: "480px", margin: "0 auto" }} />
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={takePhoto} disabled={!cameraReady} className="btn-primary inline-flex items-center gap-2">
              {!cameraReady ? <>Cargando…</> : <><span className="w-5 h-5 bg-white rounded-full inline-block" /> Capturar</>}
            </button>
            <button type="button" onClick={switchCamera} className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 inline-flex items-center gap-2" title="Cambiar cámara">
              <HiSwitchHorizontal className="h-5 w-5" />
            </button>
            <button onClick={handleCancel} className="btn-secondary inline-flex items-center gap-2"><HiX className="h-5 w-5" /> Cerrar</button>
          </div>
        </div>
      )}
      {captured && (
        <div className="space-y-4">
          <div className="rounded-lg overflow-hidden"><img src={captured} alt="Foto capturada" className="w-full h-auto" /></div>
          <div className="flex justify-center gap-4">
            <button onClick={retake} className="btn-secondary"><HiRefresh className="h-5 w-5 mr-1" />Repetir</button>
            <button onClick={confirm} className="btn-primary"><HiCheck className="h-5 w-5 mr-1" />Usar Foto</button>
          </div>
        </div>
      )}
    </div>
  );
}
