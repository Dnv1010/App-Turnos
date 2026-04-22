"use client";

import { useAuth } from "@/lib/auth-provider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getPostLoginPath } from "@/lib/postLoginPath";

/**
 * Tras OAuth (Google), NextAuth redirige aquí para enviar al usuario a su dashboard según rol.
 */
export default function AuthRedirectPage() {
  const { profile, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!profile) {
      router.replace("/login");
      return;
    }
    if (profile.role === "PENDIENTE") {
      void signOut().then(() => router.push("/"));
      return;
    }
    router.replace(getPostLoginPath(profile.role));
  }, [profile, loading, router, signOut]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-bia-navy-800">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
    </div>
  );
}
