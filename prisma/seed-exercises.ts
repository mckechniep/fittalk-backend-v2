import { PrismaClient, MuscleGroup, Equipment } from '@prisma/client';

export async function seedExercises(prisma: PrismaClient) {
  console.log('🌱 Seeding exercises...');

  const exercises = [
    {
      slug: 'bench-press',
      name: 'Bench Press',
      primaryGroup: MuscleGroup.chest,
      secondaryGroups: [MuscleGroup.shoulders, MuscleGroup.arms],
      equipment: Equipment.barbell,
      instructions: 'Lie on bench, lower bar to chest, press up',
    },
    {
      slug: 'squat',
      name: 'Squat',
      primaryGroup: MuscleGroup.legs,
      secondaryGroups: [MuscleGroup.glutes],
      equipment: Equipment.barbell,
      instructions: 'Bar on back, squat down, stand up',
    },
    {
      slug: 'deadlift',
      name: 'Deadlift',
      primaryGroup: MuscleGroup.back,
      secondaryGroups: [MuscleGroup.legs, MuscleGroup.glutes],
      equipment: Equipment.barbell,
      instructions: 'Lift bar from ground to standing position',
    },
    {
      slug: 'overhead-press',
      name: 'Overhead Press',
      primaryGroup: MuscleGroup.shoulders,
      secondaryGroups: [MuscleGroup.arms],
      equipment: Equipment.barbell,
      instructions: 'Press bar overhead from shoulders',
    },
    {
      slug: 'pull-up',
      name: 'Pull Up',
      primaryGroup: MuscleGroup.back,
      secondaryGroups: [MuscleGroup.arms],
      equipment: Equipment.bodyweight,
      instructions: 'Hang from bar, pull chin over bar',
    },
  ];

  for (const exercise of exercises) {
    await prisma.exercise.upsert({
      where: { slug: exercise.slug },
      update: {},
      create: exercise,
    });
  }

  const count = await prisma.exercise.count();
  console.log(`✅ Seeded ${exercises.length} exercises (${count} total in database)`);
}

// Allow running this file directly
if (require.main === module) {
  const prisma = new PrismaClient();
  seedExercises(prisma)
    .catch((e) => {
      console.error('❌ Error seeding exercises:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
