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

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  adapter: PrismaAdapter(prisma) as Adapter,
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
      name: "PIN",
      credentials: {
        email: { label: "Email", type: "email" },
        pin: { label: "PIN", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email?.trim() || !credentials?.pin) return null;
        try {
          const email = credentials.email.toLowerCase().trim();
          const user = await prisma.user.findUnique({
            where: { email },
          });
          if (!user || !user.isActive || !user.password) return null;

          const isValid = await bcrypt.compare(credentials.pin, user.password);
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
