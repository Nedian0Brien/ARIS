import bcrypt from 'bcryptjs';
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ARIS_ADMIN_EMAIL;
  const password = process.env.ARIS_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('ARIS_ADMIN_EMAIL and ARIS_ADMIN_PASSWORD are required for seeding.');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: UserRole.operator },
    create: { email, passwordHash, role: UserRole.operator },
  });

  console.log(`Seeded admin user: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
