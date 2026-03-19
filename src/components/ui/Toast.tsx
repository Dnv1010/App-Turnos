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
      <span className="font-black text-xs text-gray-700">Bia</span>
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
  showToast: (type: ToastType, title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
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
    bg: "bg-green-50",
    border: "border-green-200",
    icon: HiCheckCircle,
    iconColor: "text-green-500",
  },
  error: {
    bg: "bg-red-50",
    border: "border-red-200",
    icon: HiXCircle,
    iconColor: "text-red-500",
  },
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: HiInformationCircle,
    iconColor: "text-blue-500",
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((type: ToastType, title: string, message?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
      removeToast(id);
    }, 4000);
  }, [removeToast]);

  const success = useCallback((title: string, message?: string) => showToast("success", title, message), [showToast]);
  const error = useCallback((title: string, message?: string) => showToast("error", title, message), [showToast]);
  const info = useCallback((title: string, message?: string) => showToast("info", title, message), [showToast]);

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
              className={`pointer-events-auto w-80 max-w-[calc(100vw-2rem)] ${style.bg} ${style.border} border rounded-xl shadow-lg overflow-hidden animate-slide-in`}
            >
              {/* Header con logo */}
              <div className="flex items-center justify-between px-4 py-2 bg-white/50 border-b border-gray-100">
                <BiaLogoMini />
                <button
                  onClick={() => removeToast(toast.id)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <HiX className="w-4 h-4" />
                </button>
              </div>
              
              {/* Content */}
              <div className="flex items-start gap-3 p-4">
                <Icon className={`w-5 h-5 ${style.iconColor} flex-shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{toast.title}</p>
                  {toast.message && (
                    <p className="text-gray-600 text-sm mt-0.5">{toast.message}</p>
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