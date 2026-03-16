import { PrismaClient, Role, Zona } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const usuarios = [
    { cedula: "1000000001", nombre: "Admin BIA", email: "admin@bia.com", pin: "1234", role: Role.ADMIN, zona: Zona.BOGOTA },
    { cedula: "1000000002", nombre: "Hernan Manjarres", email: "hernan.manjarres@bia.com", pin: "1111", role: Role.MANAGER, zona: Zona.BOGOTA },
    { cedula: "1000000003", nombre: "Dinovi Sanchez", email: "dinovi.sanchez@bia.com", pin: "2222", role: Role.COORDINADOR, zona: Zona.BOGOTA },
    { cedula: "1000000004", nombre: "Ervison Plata", email: "ervison.plata@bia.com", pin: "3333", role: Role.COORDINADOR, zona: Zona.COSTA },
    { cedula: "1000000005", nombre: "Carlos Mendez", email: "carlos.mendez@bia.com", pin: "4444", role: Role.TECNICO, zona: Zona.BOGOTA },
    { cedula: "1000000006", nombre: "Andrea Lopez", email: "andrea.lopez@bia.com", pin: "5555", role: Role.TECNICO, zona: Zona.BOGOTA },
    { cedula: "1000000007", nombre: "Miguel Torres", email: "miguel.torres@bia.com", pin: "6666", role: Role.TECNICO, zona: Zona.COSTA },
    { cedula: "1000000008", nombre: "Laura Castillo", email: "laura.castillo@bia.com", pin: "7777", role: Role.TECNICO, zona: Zona.COSTA },
    { cedula: "1000000009", nombre: "David Ramirez", email: "david.ramirez@bia.com", pin: "8888", role: Role.TECNICO, zona: Zona.BOGOTA },
    { cedula: "1000000010", nombre: "Sofia Herrera", email: "sofia.herrera@bia.com", pin: "9999", role: Role.TECNICO, zona: Zona.COSTA },
  ];

  for (const u of usuarios) {
    const hashedPin = await bcrypt.hash(u.pin, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        cedula: u.cedula,
        nombre: u.nombre,
        email: u.email,
        password: hashedPin,
        role: u.role,
        zona: u.zona,
      },
    });
  }

  const festivosColombia = [
    { fecha: new Date("2026-01-01"), nombre: "Año Nuevo" },
    { fecha: new Date("2026-01-12"), nombre: "Día de los Reyes Magos" },
    { fecha: new Date("2026-03-23"), nombre: "Día de San José" },
    { fecha: new Date("2026-04-02"), nombre: "Jueves Santo" },
    { fecha: new Date("2026-04-03"), nombre: "Viernes Santo" },
    { fecha: new Date("2026-05-01"), nombre: "Día del Trabajo" },
    { fecha: new Date("2026-05-18"), nombre: "Ascensión del Señor" },
    { fecha: new Date("2026-06-08"), nombre: "Corpus Christi" },
    { fecha: new Date("2026-06-15"), nombre: "Sagrado Corazón de Jesús" },
    { fecha: new Date("2026-06-29"), nombre: "San Pedro y San Pablo" },
    { fecha: new Date("2026-07-20"), nombre: "Día de la Independencia" },
    { fecha: new Date("2026-08-07"), nombre: "Batalla de Boyacá" },
    { fecha: new Date("2026-08-17"), nombre: "Asunción de la Virgen" },
    { fecha: new Date("2026-10-12"), nombre: "Día de la Raza" },
    { fecha: new Date("2026-11-02"), nombre: "Todos los Santos" },
    { fecha: new Date("2026-11-16"), nombre: "Independencia de Cartagena" },
    { fecha: new Date("2026-12-08"), nombre: "Inmaculada Concepción" },
    { fecha: new Date("2026-12-25"), nombre: "Navidad" },
  ];

  for (const f of festivosColombia) {
    await prisma.festivo.upsert({
      where: { fecha: f.fecha },
      update: {},
      create: f,
    });
  }

  console.log("Seed completado: usuarios con PIN hasheado + festivos Colombia 2026.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
