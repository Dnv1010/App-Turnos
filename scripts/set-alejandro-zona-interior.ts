import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "alejandro.artunduaga@bia.app";
  const u = await prisma.user.update({
    where: { email },
    data: { zona: "INTERIOR" },
  });
  console.log("OK:", u.email, u.zona);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
