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

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
    CredentialsProvider({
      name: "PIN",
      credentials: {
        email: { label: "Email", type: "email" },
        pin: { label: "PIN", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.pin) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });
        if (!user || !user.isActive) return null;

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
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.userId ?? user.id;
        token.role = user.role;
        token.zona = user.zona;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.userId = token.userId;
      session.user.nombre = token.name ?? "";
      session.user.role = token.role;
      session.user.zona = token.zona;
      return session;
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
};
