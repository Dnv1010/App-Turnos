"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { HiMail, HiKey, HiLogin } from "react-icons/hi";
import { FcGoogle } from "react-icons/fc";

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
      });
      if (result?.error) {
        setError("Email o PIN incorrectos");
        return;
      }
      if (result?.ok) {
        router.refresh();
        router.push("/tecnico");
        return;
      }
      setError("Error al iniciar sesión. Intenta de nuevo.");
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => { signIn("google", { callbackUrl: "/tecnico" }); };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-lg mb-4">
            <span className="text-primary-600 font-black text-2xl">BIA</span>
          </div>
          <h1 className="text-3xl font-bold text-white">App Turnos</h1>
          <p className="text-primary-200 mt-2">Gestión de turnos y horas extras</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <form onSubmit={handleCredentials} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">Correo electrónico</label>
              <div className="relative">
                <HiMail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@bia.com" className="input-field pl-10" required />
              </div>
            </div>
            <div>
              <label htmlFor="pin" className="block text-sm font-medium text-gray-700 mb-1.5">PIN de acceso</label>
              <div className="relative">
                <HiKey className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input id="pin" type="password" value={pin} onChange={(e) => setPin(e.target.value)}
                  placeholder="••••" maxLength={6} className="input-field pl-10" required />
              </div>
            </div>
            {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
              {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <><HiLogin className="h-5 w-5" />Ingresar</>}
            </button>
          </form>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center text-sm"><span className="px-3 bg-white text-gray-500">o continúa con</span></div>
          </div>
          <button onClick={handleGoogle} className="btn-secondary w-full flex items-center justify-center gap-3">
            <FcGoogle className="h-5 w-5" />Google SSO
          </button>
        </div>
        <p className="text-center text-primary-200 text-xs mt-6">BIA Colombia — Sistema de Gestión de Turnos v1.0</p>
      </div>
    </div>
  );
}
