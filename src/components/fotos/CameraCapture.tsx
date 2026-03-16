"use client";

import { useState, useRef, useCallback } from "react";
import { HiCamera, HiRefresh, HiCheck, HiX } from "react-icons/hi";

interface CameraCaptureProps {
  onCapture: (base64: string) => void;
  onCancel?: () => void;
}

export default function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [streaming, setStreaming] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      setCameraReady(false);
      setCameraLoading(true);
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await new Promise<void>((resolve) => {
        video.onloadeddata = () => resolve();
      });
      await video.play();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      setStreaming(true);
      setCameraReady(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError("No se pudo acceder a la cámara: " + msg + ". Asegúrate de estar en HTTPS y dar permisos de cámara.");
    } finally {
      setCameraLoading(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStreaming(false);
    setCameraReady(false);
  }, []);

  const takePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth || video.clientWidth || 640;
    const h = video.videoHeight || video.clientHeight || 480;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const base64 = canvas.toDataURL("image/jpeg", 0.85);
    setCaptured(base64);
    stopCamera();
  }, [stopCamera]);

  const retake = useCallback(() => { setCaptured(null); startCamera(); }, [startCamera]);
  const confirm = useCallback(() => { if (captured) { onCapture(captured); setCaptured(null); } }, [captured, onCapture]);
  const handleCancel = useCallback(() => { stopCamera(); setCaptured(null); onCancel?.(); }, [stopCamera, onCancel]);

  return (
    <div className="card">
      <canvas ref={canvasRef} className="hidden" />
      {cameraLoading && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          <p className="text-gray-500 text-center">Cargando cámara...</p>
        </div>
      )}
      {!cameraLoading && !streaming && !captured && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="w-20 h-20 bg-primary-50 rounded-full flex items-center justify-center">
            <HiCamera className="h-10 w-10 text-primary-600" />
          </div>
          <p className="text-gray-500 text-center">Toma una foto para el registro</p>
          <button onClick={startCamera} className="btn-primary">Abrir Cámara</button>
          {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}
        </div>
      )}
      {!cameraLoading && streaming && (
        <div className="space-y-4">
          <div className="relative rounded-lg overflow-hidden bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ display: "block", width: "100%", maxWidth: "480px" }}
            />
          </div>
          <div className="flex justify-center gap-4">
            <button onClick={handleCancel} className="btn-secondary"><HiX className="h-5 w-5 mr-1" />Cancelar</button>
            <button onClick={takePhoto} disabled={!cameraReady} className="btn-primary"><HiCamera className="h-5 w-5 mr-1" />{!cameraReady ? "Cargando cámara..." : "Capturar"}</button>
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
