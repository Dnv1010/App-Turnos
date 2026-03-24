"use client";

import { useState } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { HiMail, HiKey, HiLogin } from "react-icons/hi";
import { FcGoogle } from "react-icons/fc";
import { getPostLoginPath } from "@/lib/postLoginPath";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        pin: pin.trim(),
        redirect: false,
        callbackUrl: "/tecnico",
      });
      if (result?.error) {
        setError("Email o PIN incorrectos");
        return;
      }
      if (result?.ok) {
        router.refresh();
        const s = await getSession();
        const dest = getPostLoginPath(s?.user?.role ?? "");
        router.push(dest);
        return;
      }
      setError("Error al iniciar sesión. Intenta de nuevo.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/json|JSON|Response/i.test(msg)) {
        setError("El servidor devolvió una respuesta vacía o inválida. Revisa la URL (NEXTAUTH_URL), la red o vuelve a intentar.");
      } else {
        setError("Error de conexión. Intenta de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    signIn("google", { callbackUrl: "/auth/redirect" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 px-4">
      <div className="w-full max-w-md">
        {/* Logo BIA Energy */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center gap-1 mb-4">
            {/* Rayo verde */}
            <svg width="40" height="48" viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M24 0L0 28H16L12 48L40 18H22L24 0Z" fill="#00D4AA"/>
            </svg>
            {/* Texto Bia */}
            <span className="text-white font-black text-5xl tracking-tight" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
              Bia
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white">App Turnos</h1>
          <p className="text-primary-200 mt-2">Gestión de turnos y Foráneos</p>
        </div>

        {/* Formulario */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl dark:shadow-gray-900/50 p-8 border border-transparent dark:border-gray-700">
          <form onSubmit={handleCredentials} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Correo electrónico
              </label>
              <div className="relative">
                <HiMail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@biaenergy.co"
                  className="input-field pl-10"
                  required
                />
              </div>
            </div>
            <div>
              <label htmlFor="pin" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                PIN de acceso
              </label>
              <div className="relative">
                <HiKey className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="pin"
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  maxLength={6}
                  className="input-field pl-10"
                  required
                />
              </div>
            </div>
            {error && (
              <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <HiLogin className="h-5 w-5" />
                  Ingresar
                </>
              )}
            </button>
          </form>

          {/* Separador */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-600" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">o continúa con</span>
            </div>
          </div>

          {/* Google SSO */}
          <button
            onClick={handleGoogle}
            className="btn-secondary w-full flex items-center justify-center gap-3"
          >
            <FcGoogle className="h-5 w-5" />
            Cuenta Google corporativa
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-primary-200 text-xs mt-6">
          Bia Energy — Sistema de Gestión de Turnos v1.0
        </p>
      </div>
    </div>
  );
}