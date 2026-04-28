import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "alejandro.artunduaga@bia.app";
  const u = await prisma.user.update({
    where: { email },
    data: { zone: "INTERIOR" },
  });
  console.log("OK:", u.email, u.zone);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
