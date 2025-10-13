# FitTalk Database Schema Documentation

## Overview

This database schema supports the FitTalk fitness application backend. It includes 30+ tables organized into modules for identity, profiles, health, workout planning, logging, AI orchestration, nutrition, and notifications.

## Database Requirements

- **PostgreSQL** 12+
- **pgvector extension** (for AI/RAG embeddings)

## Table Structure

### Core Identity & Auth
- **User** - Main user table (mirrors Supabase Auth user)
- **AuthAccount** - OAuth provider accounts (Google, Apple, etc.)
- **Session** - JWT session tracking
- **Device** - Push notification tokens per device

### Profile & Preferences
- **Profile** - User demographics (age, height, weight, experience level)
- **Preference** - App settings (timezone, units, notifications, voice)

### Health Conditions
- **HealthCondition** - Global taxonomy of health conditions/injuries
- **UserHealthCondition** - User-specific health conditions with notes

### Availability
- **AvailabilityWindow** - Weekly recurring time windows for workouts

### Consultation (Onboarding)
- **ConsultationSession** - Onboarding consultation sessions
- **ConsultationQuestion** - Question templates
- **ConsultationAnswer** - User responses to consultation questions

### Goals
- **UserGoal** - User fitness goals (fat loss, muscle gain, performance, maintenance)

### Nutrition
- **MacroTarget** - Daily calorie and macro targets
- **FoodItem** - Food database with nutritional info
- **GroceryList** - Weekly grocery lists
- **GroceryItem** - Individual items in grocery lists

### Exercises
- **Exercise** - Exercise library (name, muscle groups, equipment, instructions)
- **ExerciseVariant** - Exercise variations and substitutions

### Workout Programs
- **WorkoutPlan** - User's workout program (4-12 weeks)
- **WorkoutDay** - Daily workout structure (week #, day #, focus)
- **WorkoutItem** - Individual exercises in a day (sets, reps, RIR, tempo, rest)

### Workout Scheduling
- **ScheduledWorkout** - Scheduled workouts fitting availability windows

### Real-Time Sessions
- **LiveWorkoutSession** - Active workout session state (WebSocket tracking)

### Workout Logging
- **WorkoutLog** - Completed workout sessions
- **WorkoutSet** - Per-set logs (weight, reps, RIR, completion status)

### Metrics & Records
- **BodyMetric** - Body measurements over time (weight, body fat %, circumferences)
- **PersonalRecord** - Personal records per exercise (1RM, rep PRs)

### AI Orchestration
- **AiMessage** - AI chat message history
- **AiRecommendation** - AI-generated recommendations
- **Document** - Documents for RAG context
- **DocumentChunk** - Text chunks from documents
- **Embedding** - Vector embeddings (pgvector) for semantic search

### Notifications
- **Notification** - Push notifications and reminders

### Audit & Observability
- **AuditLog** - User actions and data changes for security/compliance

### Social (Post-MVP - Currently Commented Out)
- **UserConnection** - Follow/friend relationships
- **Swipe** - Swipe-based discovery
- **Message** - Direct messages

## Key Design Decisions

### 1. User Identity
- `User.id` is a UUID that matches Supabase Auth `user.id`
- `passwordHash` is optional (null if using Supabase Auth only)
- Email and phone are unique for login

### 2. RIR vs RPE
- Uses **RIR (Reps In Reserve)** per product requirements
- Fields: `targetRir` in WorkoutItem, `rir` in WorkoutSet

### 3. One-to-One Relations
- Profile and Preference share `userId` as primary key (no separate ID)
- Must NOT use `@default(uuid())` on these PKs—they inherit from User

### 4. Health Conditions
- HealthCondition is a **global taxonomy** (not user-specific)
- Users link to conditions via UserHealthCondition join table

### 5. Workout Structure
- Hierarchy: Plan → Days (by week/day number) → Items (exercises)
- No Period model yet (can be added for advanced periodization)

### 6. Embeddings & RAG
- Uses pgvector extension with 1536-dimension vectors
- Document → DocumentChunk → Embedding structure for AI context retrieval

### 7. Soft Delete
- Most tables use `onDelete: Cascade` for clean cascading deletes
- AuditLog uses `SetNull` to preserve audit trail after user deletion

## Local Testing Commands

### Prerequisites
```bash
# Install dependencies
pnpm install

# Ensure Docker is running
docker --version
```

### Start Local PostgreSQL with pgvector
```bash
docker run --name fittalk-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=fittalk \
  -p 5432:5432 \
  -d ankane/pgvector
```

### Configure Environment
Add to `.env`:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/fittalk?schema=public"
```

### Generate Prisma Client
```bash
pnpm prisma generate
```

### Create Database Tables (Migration)
```bash
pnpm prisma migrate dev --name init
```

### View Tables in Prisma Studio
```bash
pnpm prisma studio
```
Opens browser UI at `http://localhost:5555` to view/edit data.

### View Tables via psql (Terminal)
```bash
# Connect to database
docker exec -it fittalk-postgres psql -U postgres -d fittalk

# List all tables
\dt

# Describe a specific table (exact casing required)
\d "User"

# Query data
SELECT * FROM "User";

# Exit
\q
```

### Stop/Start Docker Container
```bash
# Stop (preserves data)
docker stop fittalk-postgres

# Start again
docker start fittalk-postgres

# Remove completely
docker rm fittalk-postgres
```

## Deploying to Supabase

### Step 1: Create Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Choose region closest to your users
4. Set a strong database password
5. Wait for project to provision

### Step 2: Enable pgvector Extension
1. Go to **Database** → **Extensions**
2. Search for `vector`
3. Enable the extension

### Step 3: Get Connection String
1. Go to **Settings** → **Database**
2. Copy **Connection string** (Transaction mode)
3. Replace `[YOUR-PASSWORD]` with your actual password

Example:
```
postgresql://postgres.xxxxx:PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

### Step 4: Update `.env` File
```env
DATABASE_URL="postgresql://postgres.xxxxx:PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
```

### Step 5: Run Migration to Supabase
```bash
# Generate Prisma Client
pnpm prisma generate

# Push schema to Supabase (creates all tables)
pnpm prisma migrate deploy
```

**OR** for development (tracks migration history):
```bash
pnpm prisma migrate dev
```

### Step 6: Verify Tables in Supabase
1. Go to **Table Editor** in Supabase dashboard
2. You should see all 30+ tables
3. Check that `vector` extension is active in Extensions

### Step 7: Seed Initial Data (Optional)
If you have seed data:
```bash
pnpm prisma db seed
```

## Common Commands Cheat Sheet

| Command | Description |
|---------|-------------|
| `pnpm prisma generate` | Generate Prisma Client from schema |
| `pnpm prisma migrate dev --name <name>` | Create and apply new migration |
| `pnpm prisma migrate deploy` | Apply pending migrations (production) |
| `pnpm prisma studio` | Open visual database editor |
| `pnpm prisma db push` | Push schema changes without migration files |
| `pnpm prisma db pull` | Pull schema from database to Prisma file |
| `pnpm prisma migrate reset` | Reset database and re-run all migrations |
| `pnpm prisma format` | Format schema.prisma file |
| `pnpm prisma validate` | Validate schema for errors |

## Troubleshooting

### Error: extension "vector" is not available
**Solution:** Use PostgreSQL with pgvector:
```bash
docker run --name fittalk-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fittalk -p 5432:5432 -d ankane/pgvector
```

### Error: relation "User" does not exist
**Solution:** Table names are case-sensitive. Use exact casing:
```sql
SELECT * FROM "User";  -- Correct
SELECT * FROM "user";  -- Wrong
```

### Error: Migration failed
**Solution:** 
1. Check that database is running: `docker ps`
2. Check DATABASE_URL in `.env`
3. Reset and retry: `pnpm prisma migrate reset`

### Prisma Client not found
**Solution:** Generate the client:
```bash
pnpm prisma generate
```

## Schema Validation Checklist

Before deploying to production:

- [ ] Run `pnpm prisma validate` with no errors
- [ ] Run `pnpm prisma migrate dev` successfully locally
- [ ] Test with `pnpm prisma studio` to verify table structure
- [ ] Verify all foreign keys and relations work
- [ ] Enable pgvector extension in Supabase
- [ ] Run migration against Supabase database
- [ ] Verify tables appear in Supabase Table Editor
- [ ] Test connection from NestJS app

## Important Notes

### For Backend Team
- **User.id must match Supabase Auth user.id** (UUID from JWT)
- Always use transactions for related writes (consultation + answers, plan + days + items)
- Index strategy prioritizes user-scoped queries and time-range filters
- Use `onDelete: Cascade` carefully—understand data cleanup implications

### For Frontend Team
- All timestamps are UTC; convert to user's timezone in the app
- Use `Preference.unitSystem` to display metric/imperial
- RIR (Reps In Reserve) is the training intensity metric, not RPE
- Check `Device.revokedAt` before sending push notifications

### For AI/ML Team
- Embeddings use 1536-dimension vectors (OpenAI text-embedding-ada-002 compatible)
- Document chunks should be 500-1000 tokens for optimal retrieval
- Use cosine similarity for semantic search (pgvector supports `<=>` operator)

## Next Steps

1. [DONE] Schema designed and validated
2. [TODO] Deploy to Supabase (this document guides you)
3. [TODO] Set up NestJS modules for each domain
4. [TODO] Implement Supabase JWT auth guards
5. [TODO] Build API endpoints with validation DTOs
6. [TODO] Add Redis caching layer
7. [TODO] Integrate AI services (STT, LLM, TTS, RAG)
8. [TODO] Real-time WebSocket sessions
9. [TODO] Notifications & scheduling
10. [TODO] Load testing & performance tuning

## Support

For questions or issues:
- Check [Prisma Docs](https://www.prisma.io/docs)
- Check [Supabase Docs](https://supabase.com/docs)
- Review NestJS integration guide: [NestJS + Prisma](https://docs.nestjs.com/recipes/prisma)
- Open an issue in the GitHub repo
