"use client";

import { useRef, useState } from "react";
import { HiCamera, HiPhotograph } from "react-icons/hi";
import dynamic from "next/dynamic";

const CameraCapture = dynamic(() => import("./CameraCapture"), { ssr: false });

interface FotoInputProps {
  onCapture: (base64: string, previewUrl: string) => void;
  disabled?: boolean;
  label?: string;
}

export default function FotoInput({ onCapture, disabled, label }: FotoInputProps) {
  const [modo, setModo] = useState<"idle" | "camara" | "galeria">("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      onCapture(base64, result);
      setModo("idle");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  if (modo === "camara") {
    return (
      <CameraCapture
        onCapture={(b, p) => {
          onCapture(b, p);
          setModo("idle");
        }}
        onCancel={() => setModo("idle")}
        disabled={disabled}
      />
    );
  }

  return (
    <div className="space-y-3">
      {label && (
        <p className="text-sm font-medium text-gray-700 dark:text-[#CBD5E1]">{label}</p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setModo("camara")}
          className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-dashed border-primary-300 dark:border-[#3A4565] text-primary-600 dark:text-[#60A5FA] hover:bg-primary-50 dark:hover:bg-[#1E2A45] transition-colors disabled:opacity-50"
        >
          <HiCamera className="h-5 w-5" />
          <span className="text-sm font-medium">Tomar foto</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-dashed border-gray-300 dark:border-[#3A4565] text-gray-600 dark:text-[#A0AEC0] hover:bg-gray-50 dark:hover:bg-[#1E2A45] transition-colors disabled:opacity-50"
        >
          <HiPhotograph className="h-5 w-5" />
          <span className="text-sm font-medium">Galería</span>
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
