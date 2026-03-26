"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getPostLoginPath } from "@/lib/postLoginPath";

/**
 * Tras OAuth (Google), NextAuth redirige aquí para enviar al usuario a su dashboard según rol.
 */
export default function AuthRedirectPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) {
      router.replace("/login");
      return;
    }
    if (session.user.role === "PENDIENTE") {
      void signOut({ callbackUrl: "/login?pendiente=true" });
      return;
    }
    router.replace(getPostLoginPath(session.user.role));
  }, [session, status, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-bia-navy-800">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
    </div>
  );
}
