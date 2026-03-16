"use client";

import { useState, useRef, useCallback } from "react";
import Webcam from "react-webcam";
import { HiCamera, HiUpload, HiRefresh, HiX } from "react-icons/hi";

interface CameraCaptureProps {
  onCapture: (base64: string, previewUrl: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
}

export default function CameraCapture({ onCapture, onCancel, disabled }: CameraCaptureProps) {
  const webcamRef = useRef<Webcam>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    facingMode: facingMode,
  };

  const capture = useCallback(() => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (imageSrc) {
      const base64 = imageSrc.split(",")[1];
      if (base64) onCapture(base64, imageSrc);
      setCameraOpen(false);
    } else {
      alert("No se pudo capturar la foto. Intenta de nuevo.");
    }
  }, [onCapture]);

  function switchCamera() {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("Imagen muy grande. Máximo 10MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      if (base64) onCapture(base64, dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleCameraError(err: string | DOMException) {
    const msg = typeof err === "string" ? err : (err as Error).message;
    console.error("Error de cámara:", msg);
    setCameraError(msg);
  }

  function closeCamera() {
    setCameraOpen(false);
    setCameraError(null);
    onCancel?.();
  }

  return (
    <div className="space-y-4">
      {cameraOpen && (
        <div className="relative rounded-xl overflow-hidden bg-black" style={{ maxWidth: 480, margin: "0 auto" }}>
          <Webcam
            ref={webcamRef}
            audio={false}
            screenshotFormat="image/jpeg"
            screenshotQuality={0.85}
            videoConstraints={videoConstraints}
            onUserMediaError={handleCameraError}
            style={{ width: "100%", display: "block" }}
            mirrored={facingMode === "user"}
          />

          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3">
            <button
              type="button"
              onClick={capture}
              className="w-16 h-16 bg-white rounded-full border-4 border-red-500 flex items-center justify-center hover:border-red-600 active:scale-95 transition-all shadow-lg"
            >
              <div className="w-12 h-12 bg-red-500 rounded-full" />
            </button>
          </div>

          <button
            type="button"
            onClick={switchCamera}
            className="absolute top-3 right-3 w-10 h-10 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70"
            title="Cambiar cámara"
          >
            <HiRefresh className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={closeCamera}
            className="absolute top-3 left-3 w-10 h-10 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70"
          >
            <HiX className="w-5 h-5" />
          </button>
        </div>
      )}

      {cameraError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <p className="font-semibold">No se pudo acceder a la cámara</p>
          <p className="text-xs mt-1">{cameraError}</p>
          <p className="text-xs mt-2">Verifica que:</p>
          <ul className="text-xs mt-1 list-disc list-inside">
            <li>Estés en HTTPS (no HTTP)</li>
            <li>Hayas dado permiso de cámara en el navegador</li>
            <li>Ninguna otra app esté usando la cámara</li>
          </ul>
          <button
            type="button"
            onClick={() => {
              setCameraError(null);
              setCameraOpen(true);
            }}
            className="mt-2 text-xs text-red-600 font-medium underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {!cameraOpen && (
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            type="button"
            onClick={() => {
              setCameraError(null);
              setCameraOpen(true);
            }}
            disabled={disabled}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md"
          >
            <HiCamera className="w-5 h-5" /> Tomar foto
          </button>

          <label className="inline-flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 cursor-pointer transition-colors">
            <HiUpload className="w-5 h-5" /> Subir desde galería
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      )}
    </div>
  );
}
