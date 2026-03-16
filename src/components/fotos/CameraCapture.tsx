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
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); setStreaming(true); }
    } catch { setError("No se pudo acceder a la cámara. Verifica los permisos."); }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach((track) => track.stop()); streamRef.current = null; }
    setStreaming(false);
  }, []);

  const takePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current; const canvas = canvasRef.current;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const base64 = canvas.toDataURL("image/jpeg", 0.85);
    setCaptured(base64); stopCamera();
  }, [stopCamera]);

  const retake = useCallback(() => { setCaptured(null); startCamera(); }, [startCamera]);
  const confirm = useCallback(() => { if (captured) { onCapture(captured); setCaptured(null); } }, [captured, onCapture]);
  const handleCancel = useCallback(() => { stopCamera(); setCaptured(null); onCancel?.(); }, [stopCamera, onCancel]);

  return (
    <div className="card">
      <canvas ref={canvasRef} className="hidden" />
      {!streaming && !captured && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="w-20 h-20 bg-primary-50 rounded-full flex items-center justify-center">
            <HiCamera className="h-10 w-10 text-primary-600" />
          </div>
          <p className="text-gray-500 text-center">Toma una foto para el registro</p>
          <button onClick={startCamera} className="btn-primary">Abrir Cámara</button>
          {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}
        </div>
      )}
      {streaming && (
        <div className="space-y-4">
          <div className="relative rounded-lg overflow-hidden bg-black">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-auto" />
          </div>
          <div className="flex justify-center gap-4">
            <button onClick={handleCancel} className="btn-secondary"><HiX className="h-5 w-5 mr-1" />Cancelar</button>
            <button onClick={takePhoto} className="btn-primary"><HiCamera className="h-5 w-5 mr-1" />Capturar</button>
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
