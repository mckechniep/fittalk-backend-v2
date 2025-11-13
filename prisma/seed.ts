import { PrismaClient } from '@prisma/client';
import { seedExercises } from './seed-exercises';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Seed exercises (required for analytics and workout logging tests)
  await seedExercises(prisma);

  // Add more seeding functions here as needed
  // await seedUsers(prisma);
  // await seedPrograms(prisma);

  console.log('✅ Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
