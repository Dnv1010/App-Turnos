"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { HiCheckCircle, HiXCircle, HiInformationCircle, HiX } from "react-icons/hi";

// Logo Bia pequeño para el toast
function BiaLogoMini() {
  return (
    <div className="flex items-center gap-0.5">
      <svg width="12" height="15" viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 0L0 28H16L12 48L40 18H22L24 0Z" fill="#00D4AA"/>
      </svg>
      <span className="font-black text-xs text-gray-700 dark:text-white">Bia</span>
    </div>
  );
}

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextType {
  showToast: (type: ToastType, title: string, message?: string, durationMs?: number) => void;
  success: (title: string, message?: string, durationMs?: number) => void;
  error: (title: string, message?: string, durationMs?: number) => void;
  info: (title: string, message?: string, options?: { duration?: number }) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

const toastStyles: Record<ToastType, { bg: string; border: string; icon: typeof HiCheckCircle; iconColor: string }> = {
  success: {
    bg: "bg-green-50 dark:bg-[#00D4AA]/10",
    border: "border-green-200 dark:border-[#00D4AA]/30",
    icon: HiCheckCircle,
    iconColor: "text-green-500 dark:text-[#00D4AA]",
  },
  error: {
    bg: "bg-red-50 dark:bg-[rgba(248,113,113,0.1)]",
    border: "border-red-200 dark:border-[#F87171]/40",
    icon: HiXCircle,
    iconColor: "text-red-500 dark:text-[#F87171]",
  },
  info: {
    bg: "bg-blue-50 dark:bg-[rgba(96,165,250,0.1)]",
    border: "border-blue-200 dark:border-[#60A5FA]/40",
    icon: HiInformationCircle,
    iconColor: "text-blue-500 dark:text-[#60A5FA]",
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, title: string, message?: string, durationMs = 4000) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, type, title, message }]);
      setTimeout(() => {
        removeToast(id);
      }, durationMs);
    },
    [removeToast]
  );

  const success = useCallback(
    (title: string, message?: string, durationMs?: number) => showToast("success", title, message, durationMs ?? 4000),
    [showToast]
  );
  const error = useCallback(
    (title: string, message?: string, durationMs?: number) => showToast("error", title, message, durationMs ?? 4000),
    [showToast]
  );
  const info = useCallback(
    (title: string, message?: string, options?: { duration?: number }) =>
      showToast("info", title, message, options?.duration ?? 4000),
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, success, error, info }}>
      {children}
      
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-3 pointer-events-none">
        {toasts.map((toast) => {
          const style = toastStyles[toast.type];
          const Icon = style.icon;
          
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto w-80 max-w-[calc(100vw-2rem)] ${style.bg} ${style.border} border rounded-xl shadow-lg dark:shadow-black/40 overflow-hidden animate-slide-in`}
            >
              {/* Header con logo */}
              <div className="flex items-center justify-between px-4 py-2 bg-white/50 dark:bg-[#1A2340]/90 border-b border-gray-100 dark:border-[#3A4565]">
                <BiaLogoMini />
                <button
                  onClick={() => removeToast(toast.id)}
                  className="text-gray-400 dark:text-[#64748B] hover:text-gray-600 dark:hover:text-white transition-colors"
                >
                  <HiX className="w-4 h-4" />
                </button>
              </div>
              
              {/* Content */}
              <div className="flex items-start gap-3 p-4">
                <Icon className={`w-5 h-5 ${style.iconColor} flex-shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">{toast.title}</p>
                  {toast.message && (
                    <p className="text-gray-600 dark:text-[#CBD5E1] text-sm mt-0.5 break-words whitespace-pre-wrap">
                      {toast.message}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Animation styles */}
      <style jsx global>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </ToastContext.Provider>
  );
}