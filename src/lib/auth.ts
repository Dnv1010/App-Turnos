import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { Resend } from "resend";
import { Role } from "@prisma/client";
import { randomBytes } from "crypto";

const useGoogleProvider = !!(
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET
);

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

if (typeof process !== "undefined" && process.env.NODE_ENV === "development" && !process.env.NEXTAUTH_SECRET) {
  console.warn("[auth] NEXTAUTH_SECRET no está definido. El login puede fallar. Añade NEXTAUTH_SECRET a .env");
}

async function notifyAdminNewPendingUser(user: {
  name?: string | null;
  email?: string | null;
}) {
  const key = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!key || !adminEmail) {
    console.warn("[auth] Falta RESEND_API_KEY o ADMIN_EMAIL; no se envía aviso al admin.");
    return;
  }
  try {
    const resend = new Resend(key);
    await resend.emails.send({
      from: "App Turnos BIA <onboarding@resend.dev>",
      to: adminEmail,
      subject: "Nuevo usuario registrado — App Turnos BIA",
      html: `
      <h2>Nuevo usuario solicita acceso</h2>
      <p><strong>Nombre:</strong> ${user.name ?? "—"}</p>
      <p><strong>Email:</strong> ${user.email ?? "—"}</p>
      <p>Ingresa a <a href="https://app-turnos-two.vercel.app/admin/usuarios">
      Admin → Usuarios</a> para asignarle un rol.</p>
    `,
    });
  } catch (e) {
    console.error("[auth] Error enviando email al admin:", e);
  }
}

/** Crea usuario SSO pendiente; reintenta cédula si hay colisión. */
async function createPendingGoogleUser(user: {
  name?: string | null;
  email?: string | null;
}) {
  const emailNorm = user.email!.toLowerCase();
  const local = emailNorm.split("@")[0]?.replace(/[^\w.-]/g, "") || "usuario";
  const candidates = [
    local,
    emailNorm.replace(/@/g, "_at_").replace(/\./g, "_"),
    `sso_${randomBytes(6).toString("hex")}`,
  ];
  const nombre = (user.name?.trim() || local) as string;
  let lastErr: unknown;
  for (const cedula of candidates) {
    const ced = cedula.length > 80 ? cedula.slice(0, 80) : cedula;
    try {
      return await prisma.user.create({
        data: {
          cedula: ced,
          nombre,
          email: emailNorm,
          password: "",
          role: Role.PENDIENTE,
          isActive: false,
        },
      });
    } catch (e: unknown) {
      lastErr = e;
      if (
        e &&
        typeof e === "object" &&
        "code" in e &&
        (e as { code: string }).code === "P2002"
      ) {
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  /**
   * Sin PrismaAdapter en Google: el adapter intentaría crear User sin cédula/contraseña
   * y fallaría en el esquema actual. Los nuevos ingresos por Google se crean en signIn.
   */
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
          if (user.role === "PENDIENTE") return null;
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
        token.userId = (user as { userId?: string }).userId ?? (user as { id: string }).id;
        token.role = (user as { role: string }).role;
        token.zona = (user as { zona: string }).zona;
        token.name = (user as { name?: string }).name ?? (user as { nombre?: string }).nombre;
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
      if (account?.provider !== "google") {
        return true;
      }

      const email = user.email?.toLowerCase() ?? "";
      if (!email) {
        return false;
      }

      const dbUser = await prisma.user.findUnique({
        where: { email },
      });

      if (dbUser?.role === "PENDIENTE") {
        return "/login?pendiente=true";
      }

      if (dbUser) {
        if (!dbUser.isActive) {
          console.warn(`[auth] Google SSO rechazado: ${email} está inactivo`);
          return false;
        }
        (user as { userId?: string }).userId = dbUser.id;
        (user as { role?: string }).role = dbUser.role;
        (user as { zona?: string }).zona = dbUser.zona;
        return true;
      }

      await createPendingGoogleUser({
        name: user.name,
        email: user.email,
      });
      await notifyAdminNewPendingUser({
        name: user.name,
        email: user.email,
      });
      return "/login?pendiente=true";
    },
  },

  debug: process.env.NODE_ENV === "development",
};
