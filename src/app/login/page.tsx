"use client";

import { Suspense, useState } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { HiMail, HiKey, HiLogin } from "react-icons/hi";
import { FcGoogle } from "react-icons/fc";
import { getPostLoginPath } from "@/lib/postLoginPath";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pendiente = searchParams.get("pendiente") === "true";

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
        callbackUrl: "/",
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
    <div className="w-full max-w-md">
            {/* Logo Ops BIA */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className="text-5xl font-black text-white tracking-tight">Ops</span>
          <span className="text-5xl font-black text-[#08DDBC] tracking-tight">BIA</span>
        </div>
        <p className="text-[#8892A4] text-xs tracking-widest uppercase">BIA Energy SAS ESP - Plataforma Operacional</p>
        <div className="flex gap-2 justify-center mt-3">
          <span className="text-xs bg-[#001035] border border-[#08DDBC]/30 text-[#08DDBC] px-2 py-0.5 rounded-full">App Turnos</span>
          <span className="text-xs bg-[#001035] border border-[#525A72]/30 text-[#8892A4] px-2 py-0.5 rounded-full">MiCaja</span>
        </div>
      </div>

      <div className="bg-white dark:bg-[#1A2340] rounded-2xl shadow-2xl dark:shadow-black/40 p-8 border border-gray-200 dark:border-[#3A4565] dark:text-white">
        {pendiente && (
          <div
            className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100"
            role="status"
          >
            Tu solicitud de acceso está pendiente de aprobación. El administrador ha sido notificado.
          </div>
        )}
        <form onSubmit={handleCredentials} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-[#CBD5E1] mb-1.5">
              Correo electrónico
            </label>
            <div className="relative">
              <HiMail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-[#64748B]" />
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
            <label htmlFor="pin" className="block text-sm font-medium text-gray-700 dark:text-[#CBD5E1] mb-1.5">
              PIN de acceso
            </label>
            <div className="relative">
              <HiKey className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-[#64748B]" />
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
          {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
          <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
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

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200 dark:border-[#3A4565]" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-3 bg-white dark:bg-[#1A2340] text-gray-500 dark:text-[#A0AEC0]">o continúa con</span>
          </div>
        </div>

        <button onClick={handleGoogle} className="btn-secondary w-full flex items-center justify-center gap-3">
          <FcGoogle className="h-5 w-5" />
          Cuenta Google corporativa
        </button>
      </div>

      <p className="text-center text-primary-200 text-xs mt-6">Bia Energy "” Sistema de Gestión de Turnos v1.0</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#000B1E] px-4 py-12">
      <Suspense
        fallback={
          <div className="w-full max-w-md flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
