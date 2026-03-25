"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Webcam from "react-webcam";

const NOT_READY_TIMEOUT_MS = 3000;

interface CameraCaptureProps {
  onCapture: (base64: string, previewUrl: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
}

export default function CameraCapture({ onCapture, onCancel, disabled }: CameraCaptureProps) {
  const webcamRef = useRef<Webcam>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [showNotReadyMessage, setShowNotReadyMessage] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cameraOpen || cameraReady) {
      setShowNotReadyMessage(false);
      return;
    }
    const t3 = setTimeout(() => setShowNotReadyMessage(true), NOT_READY_TIMEOUT_MS);
    return () => {
      clearTimeout(t3);
    };
  }, [cameraOpen, cameraReady]);

  const capture = useCallback(() => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (imageSrc) {
      onCapture(imageSrc.split(",")[1], imageSrc);
      setCameraOpen(false);
    }
  }, [onCapture]);

  function closeCamera() {
    setCameraOpen(false);
    setCameraReady(false);
    onCancel?.();
  }

  function openCamera() {
    setError(null);
    setCameraReady(false);
    setShowNotReadyMessage(false);
    setCameraOpen(true);
  }

  if (cameraOpen) {
    return (
      <div className="space-y-3">
        <div className="relative rounded-xl overflow-hidden bg-black" style={{ maxWidth: 480, margin: "0 auto" }}>
          {!cameraReady && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 text-white p-4">
              <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin mb-3" />
              <p className="text-sm font-medium">
                {showNotReadyMessage ? "La cámara aún no está lista" : "Preparando cámara..."}
              </p>
              <p className="text-xs text-white/80 mt-1">
                {showNotReadyMessage
                  ? "Comprueba que hayas dado permiso de cámara o cierra y vuelve a intentar."
                  : "Permite el acceso a la cámara si el navegador lo solicita"}
              </p>
            </div>
          )}
          <Webcam
            ref={webcamRef}
            audio={false}
            screenshotFormat="image/jpeg"
            screenshotQuality={0.85}
            videoConstraints={{ facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }}
            onUserMedia={() => setCameraReady(true)}
            onUserMediaError={(err) => {
              const msg = typeof err === "string" ? err : (err as DOMException).message;
              setError(msg);
              setCameraOpen(false);
              setCameraReady(false);
            }}
            style={{ width: "100%", display: "block" }}
            mirrored={facingMode === "user"}
          />
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3">
            <button
              type="button"
              onClick={capture}
              disabled={!cameraReady}
              className="w-16 h-16 bg-white dark:bg-[#1E2A45] rounded-full border-4 border-red-500 flex items-center justify-center shadow-lg dark:shadow-black/40 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-12 h-12 bg-red-500 rounded-full" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setCameraReady(false);
              setFacingMode((f) => (f === "environment" ? "user" : "environment"));
            }}
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
            onClick={openCamera}
            className="text-xs underline mt-1"
          >
            Reintentar
          </button>
        </div>
      )}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={openCamera}
          disabled={disabled}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md"
        >
          Tomar foto
        </button>
      </div>
    </div>
  );
}
