import { PrismaClient, Role, Zona } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const empleados = [
    // === TÉCNICOS ZONA BOGOTÁ ===
    { cedula: "1023891601", nombre: "Carlos Salas",               email: "carlos.salas@bia.app",          role: Role.TECNICO,      zona: Zona.BOGOTA },
    { cedula: "1022978634", nombre: "Edicson Lopez",              email: "edicson.lopez@bia.app",         role: Role.TECNICO,      zona: Zona.BOGOTA },
    { cedula: "1030656610", nombre: "Harry Baquero",              email: "harry.baquero@bia.app",         role: Role.TECNICO,      zona: Zona.BOGOTA },
    { cedula: "1072198167", nombre: "Jhojan Gordillo",            email: "jhojan.gordillo@bia.app",       role: Role.TECNICO,      zona: Zona.BOGOTA },
    { cedula: "1013613004", nombre: "Juan Gabriel Reyes Mirke",   email: "gabriel.reyes@bia.app",         role: Role.TECNICO,      zona: Zona.BOGOTA },
    { cedula: "1026575433", nombre: "Juancamilo Jaramillo",       email: "juancamilo.jaramillo@bia.app",  role: Role.TECNICO,      zona: Zona.BOGOTA },
    { cedula: "1014300999", nombre: "Julian Marta",               email: "julian.marta@bia.app",          role: Role.TECNICO,      zona: Zona.BOGOTA },
    { cedula: "79715869",   nombre: "Wilson Capador",             email: "wilson.capador@bia.app",        role: Role.TECNICO,      zona: Zona.BOGOTA },
    { cedula: "1015433156", nombre: "Wilson Fernandez",           email: "wilson.fernandez@bia.app",      role: Role.TECNICO,      zona: Zona.BOGOTA },

    // === TÉCNICOS ZONA COSTA ===
    { cedula: "1007974685", nombre: "Agustin Serna",              email: "agustin.serna@bia.app",         role: Role.TECNICO,      zona: Zona.COSTA },
    { cedula: "1001913368", nombre: "Duvan Cervera",              email: "duvan.cervera@bia.app",         role: Role.TECNICO,      zona: Zona.COSTA },
    { cedula: "1002153663", nombre: "Edwin Cubides",              email: "edwin.cubides@bia.app",         role: Role.TECNICO,      zona: Zona.COSTA },
    { cedula: "1234089967", nombre: "Jonathan Rudas",             email: "jonathan.rudas@bia.app",        role: Role.TECNICO,      zona: Zona.COSTA },
    { cedula: "1143146472", nombre: "Jorge Gelvez",               email: "jorge.gelvez@bia.app",          role: Role.TECNICO,      zona: Zona.COSTA },
    { cedula: "72002473",   nombre: "Jose Arevalo",               email: "jose.arevalo@bia.app",          role: Role.TECNICO,      zona: Zona.COSTA },
    { cedula: "1044426009", nombre: "Sergio Penate",              email: "sergio.penate@bia.app",         role: Role.TECNICO,      zona: Zona.COSTA },

    // === COORDINADORES ===
    { cedula: "1096215786", nombre: "Dinovi Sanchez",             email: "dinovi.sanchez@bia.app",        role: Role.COORDINADOR,  zona: Zona.BOGOTA },
    { cedula: "1004371043", nombre: "Ervison Plata",              email: "ervison.plata@bia.app",         role: Role.COORDINADOR,  zona: Zona.COSTA  },

    // === MANAGER ===
    { cedula: "1082950437", nombre: "Hernan Manjarres",           email: "hernan.manjarres@bia.app",      role: Role.MANAGER,      zona: Zona.BOGOTA },

    // === ADMIN ===
    { cedula: "ADM001",     nombre: "Administrador BIA",          email: "admin@bia.app",                 role: Role.ADMIN,        zona: Zona.BOGOTA },
  ];

  const pinHash = await bcrypt.hash("1234", 10);

  let countTecnico = 0, countCoord = 0, countManager = 0, countAdmin = 0;

  for (const e of empleados) {
    await prisma.user.upsert({
      where: { email: e.email.toLowerCase() },
      update: {
        cedula: e.cedula,
        nombre: e.nombre,
        role: e.role,
        zona: e.zona,
        password: pinHash,
        isActive: true,
      },
      create: {
        cedula: e.cedula,
        nombre: e.nombre,
        email: e.email.toLowerCase(),
        password: pinHash,
        role: e.role,
        zona: e.zona,
        isActive: true,
      },
    });

    if (e.role === Role.TECNICO) countTecnico++;
    else if (e.role === Role.COORDINADOR) countCoord++;
    else if (e.role === Role.MANAGER) countManager++;
    else if (e.role === Role.ADMIN) countAdmin++;
  }

  const festivosColombia = [
    // 2026
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
    // 2027
    { fecha: new Date("2027-01-01"), nombre: "Año Nuevo" },
    { fecha: new Date("2027-01-11"), nombre: "Día de los Reyes Magos" },
    { fecha: new Date("2027-03-22"), nombre: "Día de San José" },
    { fecha: new Date("2027-03-25"), nombre: "Jueves Santo" },
    { fecha: new Date("2027-03-26"), nombre: "Viernes Santo" },
    { fecha: new Date("2027-05-01"), nombre: "Día del Trabajo" },
    { fecha: new Date("2027-05-10"), nombre: "Ascensión del Señor" },
    { fecha: new Date("2027-05-31"), nombre: "Corpus Christi" },
    { fecha: new Date("2027-06-07"), nombre: "Sagrado Corazón de Jesús" },
    { fecha: new Date("2027-07-05"), nombre: "San Pedro y San Pablo" },
    { fecha: new Date("2027-07-20"), nombre: "Día de la Independencia" },
    { fecha: new Date("2027-08-07"), nombre: "Batalla de Boyacá" },
    { fecha: new Date("2027-08-16"), nombre: "Asunción de la Virgen" },
    { fecha: new Date("2027-10-18"), nombre: "Día de la Raza" },
    { fecha: new Date("2027-11-01"), nombre: "Todos los Santos" },
    { fecha: new Date("2027-11-15"), nombre: "Independencia de Cartagena" },
    { fecha: new Date("2027-12-08"), nombre: "Inmaculada Concepción" },
    { fecha: new Date("2027-12-25"), nombre: "Navidad" },
  ];

  let countFestivos = 0;
  for (const f of festivosColombia) {
    await prisma.festivo.upsert({
      where: { fecha: f.fecha },
      update: {},
      create: f,
    });
    countFestivos++;
  }

  const total = countTecnico + countCoord + countManager + countAdmin;
  console.log(`\n✅ ${total} usuarios cargados (${countTecnico} técnicos, ${countCoord} coordinadores, ${countManager} manager, ${countAdmin} admin)`);
  console.log(`✅ ${countFestivos} festivos cargados (2026-2027)\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
