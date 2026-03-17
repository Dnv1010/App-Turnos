import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import type { Adapter } from "next-auth/adapters";

declare module "next-auth" {
  interface User {
    userId: string;
    role: string;
    zona: string;
  }
  interface Session {
    user: {
      userId: string;
      nombre: string;
      email: string;
      role: string;
      zona: string;
      image?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    role: string;
    zona: string;
  }
}

const useGoogleProvider = !!(
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET
);

if (typeof process !== "undefined" && process.env.NODE_ENV === "development" && !process.env.NEXTAUTH_SECRET) {
  console.warn("[auth] NEXTAUTH_SECRET no está definido. El login puede fallar. Añade NEXTAUTH_SECRET a .env");
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  // Solo usar adapter con OAuth (Google). Con solo Credentials, el adapter puede provocar fallos de login.
  adapter: useGoogleProvider ? (PrismaAdapter(prisma) as Adapter) : undefined,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    ...(useGoogleProvider
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
    CredentialsProvider({
      id: "credentials",
      name: "PIN",
      credentials: {
        email: { label: "Email", type: "email" },
        pin: { label: "PIN", type: "password" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const raw = credentials ?? {};
        const email = (raw.email ?? "").toString().trim().toLowerCase();
        const pin = (raw.pin ?? raw.password ?? "").toString().trim();
        if (!email || !pin) {
          if (process.env.NODE_ENV === "development") {
            console.warn("[auth] authorize: faltan email o pin");
          }
          return null;
        }
        try {
          const user = await prisma.user.findUnique({
            where: { email },
          });
          if (process.env.NODE_ENV === "development") {
            console.warn("[auth] authorize:", email, "userFound:", !!user, "isActive:", user?.isActive, "hasPassword:", !!(user?.password));
          }
          if (!user || !user.isActive) return null;
          if (!user.password) {
            if (process.env.NODE_ENV === "development") {
              console.warn("[auth] Usuario sin contraseña en BD:", user.email);
            }
            return null;
          }
          let isValid = false;
          try {
            isValid = await bcrypt.compare(pin, user.password);
          } catch (compareErr) {
            console.error("[auth] bcrypt.compare error:", compareErr);
            return null;
          }
          if (!isValid) return null;

          return {
            id: user.id,
            userId: user.id,
            name: user.nombre,
            email: user.email,
            role: user.role,
            zona: user.zona,
          };
        } catch (err) {
          console.error("[auth] Error en authorize:", err);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = (user as any).userId ?? (user as any).id;
        token.role = (user as any).role;
        token.zona = (user as any).zona;
        token.name = (user as any).name ?? (user as any).nombre;
      }
      return token;
    },
    async session({ session, token }) {
      if (!session?.user) return session;
      return {
        ...session,
        user: {
          ...session.user,
          userId: (token.userId as string) ?? "",
          nombre: (token.name as string) ?? session.user.name ?? session.user.email ?? "",
          role: (token.role as string) ?? "",
          zona: (token.zona as string) ?? "",
        },
      };
    },
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email! },
        });
        if (!dbUser || !dbUser.isActive) return false;
        user.userId = dbUser.id;
        user.role = dbUser.role;
        user.zona = dbUser.zona;
      }
      return true;
    },
  },

  debug: process.env.NODE_ENV === "development",
};
