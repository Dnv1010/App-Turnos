import { PrismaClient, Role, Zone } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const empleados = [
    // === TÉCNICOS ZONA BOGOTÁ ===
    { cedula: "1023891601", nombre: "Carlos Salas",               email: "carlos.salas@bia.app",          role: Role.TECNICO,      zona: Zone.BOGOTA },
    { cedula: "1022978634", nombre: "Edicson Lopez",              email: "edicson.lopez@bia.app",         role: Role.TECNICO,      zona: Zone.BOGOTA },
    { cedula: "1030656610", nombre: "Harry Baquero",              email: "harry.baquero@bia.app",         role: Role.TECNICO,      zona: Zone.BOGOTA },
    { cedula: "1072198167", nombre: "Jhojan Gordillo",            email: "jhojan.gordillo@bia.app",       role: Role.TECNICO,      zona: Zone.BOGOTA },
    { cedula: "1013613004", nombre: "Juan Gabriel Reyes Mirke",   email: "gabriel.reyes@bia.app",         role: Role.TECNICO,      zona: Zone.BOGOTA },
    { cedula: "1026575433", nombre: "Juancamilo Jaramillo",       email: "juancamilo.jaramillo@bia.app",  role: Role.TECNICO,      zona: Zone.BOGOTA },
    { cedula: "1014300999", nombre: "Julian Marta",               email: "julian.marta@bia.app",          role: Role.TECNICO,      zona: Zone.BOGOTA },
    { cedula: "79715869",   nombre: "Wilson Capador",             email: "wilson.capador@bia.app",        role: Role.TECNICO,      zona: Zone.BOGOTA },
    { cedula: "1015433156", nombre: "Wilson Fernandez",           email: "wilson.fernandez@bia.app",      role: Role.TECNICO,      zona: Zone.BOGOTA },

    // === TÉCNICOS ZONA COSTA ===
    { cedula: "1007974685", nombre: "Agustin Serna",              email: "agustin.serna@bia.app",         role: Role.TECNICO,      zona: Zone.COSTA },
    { cedula: "1001913368", nombre: "Duvan Cervera",              email: "duvan.cervera@bia.app",         role: Role.TECNICO,      zona: Zone.COSTA },
    { cedula: "1002153663", nombre: "Edwin Cubides",              email: "edwin.cubides@bia.app",         role: Role.TECNICO,      zona: Zone.COSTA },
    { cedula: "1234089967", nombre: "Jonathan Rudas",             email: "jonathan.rudas@bia.app",        role: Role.TECNICO,      zona: Zone.COSTA },
    { cedula: "1143146472", nombre: "Jorge Gelvez",               email: "jorge.gelvez@bia.app",          role: Role.TECNICO,      zona: Zone.COSTA },
    { cedula: "72002473",   nombre: "Jose Arevalo",               email: "jose.arevalo@bia.app",          role: Role.TECNICO,      zona: Zone.COSTA },
    { cedula: "1044426009", nombre: "Sergio Penate",              email: "sergio.penate@bia.app",         role: Role.TECNICO,      zona: Zone.COSTA },

    // === COORDINADORES ===
    { cedula: "1096215786", nombre: "Dinovi Sanchez",             email: "dinovi.sanchez@bia.app",        role: Role.COORDINADOR,  zona: Zone.BOGOTA },
    { cedula: "1004371043", nombre: "Ervison Plata",              email: "ervison.plata@bia.app",         role: Role.COORDINADOR,  zona: Zone.COSTA  },

    // === MANAGER ===
    { cedula: "1082950437", nombre: "Hernan Manjarres",           email: "hernan.manjarres@bia.app",      role: Role.MANAGER,      zona: Zone.BOGOTA },

    // === ADMIN ===
    { cedula: "ADM001",     nombre: "Administrador BIA",          email: "admin@bia.app",                 role: Role.ADMIN,        zona: Zone.BOGOTA },
  ];

  const pinHash = await bcrypt.hash("1234", 10);

  let countTecnico = 0, countCoord = 0, countManager = 0, countAdmin = 0;

  for (const e of empleados) {
    await prisma.user.upsert({
      where: { email: e.email.toLowerCase() },
      update: {
        documentNumber: e.cedula,
        fullName: e.nombre,
        role: e.role,
        zone: e.zona,
        password: pinHash,
        isActive: true,
      },
      create: {
        documentNumber: e.cedula,
        fullName: e.nombre,
        email: e.email.toLowerCase(),
        password: pinHash,
        role: e.role,
        zone: e.zona,
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
    { date: new Date("2026-01-01"), name: "Año Nuevo" },
    { date: new Date("2026-01-12"), name: "Día de los Reyes Magos" },
    { date: new Date("2026-03-23"), name: "Día de San José" },
    { date: new Date("2026-04-02"), name: "Jueves Santo" },
    { date: new Date("2026-04-03"), name: "Viernes Santo" },
    { date: new Date("2026-05-01"), name: "Día del Trabajo" },
    { date: new Date("2026-05-18"), name: "Ascensión del Señor" },
    { date: new Date("2026-06-08"), name: "Corpus Christi" },
    { date: new Date("2026-06-15"), name: "Sagrado Corazón de Jesús" },
    { date: new Date("2026-06-29"), name: "San Pedro y San Pablo" },
    { date: new Date("2026-07-20"), name: "Día de la Independencia" },
    { date: new Date("2026-08-07"), name: "Batalla de Boyacá" },
    { date: new Date("2026-08-17"), name: "Asunción de la Virgen" },
    { date: new Date("2026-10-12"), name: "Día de la Raza" },
    { date: new Date("2026-11-02"), name: "Todos los Santos" },
    { date: new Date("2026-11-16"), name: "Independencia de Cartagena" },
    { date: new Date("2026-12-08"), name: "Inmaculada Concepción" },
    { date: new Date("2026-12-25"), name: "Navidad" },
    // 2027
    { date: new Date("2027-01-01"), name: "Año Nuevo" },
    { date: new Date("2027-01-11"), name: "Día de los Reyes Magos" },
    { date: new Date("2027-03-22"), name: "Día de San José" },
    { date: new Date("2027-03-25"), name: "Jueves Santo" },
    { date: new Date("2027-03-26"), name: "Viernes Santo" },
    { date: new Date("2027-05-01"), name: "Día del Trabajo" },
    { date: new Date("2027-05-10"), name: "Ascensión del Señor" },
    { date: new Date("2027-05-31"), name: "Corpus Christi" },
    { date: new Date("2027-06-07"), name: "Sagrado Corazón de Jesús" },
    { date: new Date("2027-07-05"), name: "San Pedro y San Pablo" },
    { date: new Date("2027-07-20"), name: "Día de la Independencia" },
    { date: new Date("2027-08-07"), name: "Batalla de Boyacá" },
    { date: new Date("2027-08-16"), name: "Asunción de la Virgen" },
    { date: new Date("2027-10-18"), name: "Día de la Raza" },
    { date: new Date("2027-11-01"), name: "Todos los Santos" },
    { date: new Date("2027-11-15"), name: "Independencia de Cartagena" },
    { date: new Date("2027-12-08"), name: "Inmaculada Concepción" },
    { date: new Date("2027-12-25"), name: "Navidad" },
  ];

  let countFestivos = 0;
  for (const f of festivosColombia) {
    await prisma.holiday.upsert({
      where: { date: f.date },
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
