"use client";

import { useState, useRef, useCallback } from "react";
import Webcam from "react-webcam";

interface CameraCaptureProps {
  onCapture: (base64: string, previewUrl: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
}

export default function CameraCapture({ onCapture, onCancel, disabled }: CameraCaptureProps) {
  const webcamRef = useRef<Webcam>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [error, setError] = useState<string | null>(null);

  const capture = useCallback(() => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (imageSrc) {
      onCapture(imageSrc.split(",")[1], imageSrc);
      setCameraOpen(false);
    }
  }, [onCapture]);

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
      onCapture(dataUrl.split(",")[1], dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function closeCamera() {
    setCameraOpen(false);
    onCancel?.();
  }

  if (cameraOpen) {
    return (
      <div className="space-y-3">
        <div className="relative rounded-xl overflow-hidden bg-black" style={{ maxWidth: 480, margin: "0 auto" }}>
          <Webcam
            ref={webcamRef}
            audio={false}
            screenshotFormat="image/jpeg"
            screenshotQuality={0.85}
            videoConstraints={{ facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }}
            onUserMediaError={(err) => {
              const msg = typeof err === "string" ? err : (err as DOMException).message;
              setError(msg);
              setCameraOpen(false);
            }}
            style={{ width: "100%", display: "block" }}
            mirrored={facingMode === "user"}
          />
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3">
            <button
              type="button"
              onClick={capture}
              className="w-16 h-16 bg-white rounded-full border-4 border-red-500 flex items-center justify-center shadow-lg active:scale-95"
            >
              <div className="w-12 h-12 bg-red-500 rounded-full" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setFacingMode((f) => (f === "environment" ? "user" : "environment"))}
            className="absolute top-3 right-3 w-10 h-10 bg-black/50 rounded-full flex items-center justify-center text-white text-lg"
          >
            &#x21C4;
          </button>
          <button
            type="button"
            onClick={closeCamera}
            className="absolute top-3 left-3 w-10 h-10 bg-black/50 rounded-full flex items-center justify-center text-white text-lg"
          >
            &#x2715;
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <p className="font-semibold">Error de cámara</p>
          <p className="text-xs mt-1">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setCameraOpen(true);
            }}
            className="text-xs underline mt-1"
          >
            Reintentar
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-3 justify-center">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setCameraOpen(true);
          }}
          disabled={disabled}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md"
        >
          Tomar foto
        </button>
        <label className="inline-flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 cursor-pointer transition-colors">
          Subir desde galería
          <input type="file" accept="image/*" capture="environment" onChange={handleFileUpload} className="hidden" />
        </label>
      </div>
    </div>
  );
}
