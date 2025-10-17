# Consultation & Availability Module

## Overview

The Consultation & Availability module handles the user onboarding flow and weekly availability management for the FitTalk fitness application. This is a **critical module** as it captures the initial user data needed to generate personalized workout plans via AI.

## Purpose

### What It Does

1. **Consultation (Onboarding)**
   - Captures user goals, constraints, and preferences during first-time onboarding
   - Supports incremental progress saving (user can resume incomplete consultation)
   - Validates that all required questions are answered before completion
   - Triggers AI workout plan generation upon completion

2. **Availability Management**
   - Stores user's weekly schedule (when they're available for workouts)
   - Validates no overlapping time windows
   - Used by workout scheduler to place workouts at optimal times
   - Supports ongoing updates (users can change schedule anytime)

### Why It Exists

- **AI Plan Generation**: Consultation answers provide the context AI needs to generate safe, effective workout plans
- **Smart Scheduling**: Availability windows ensure workouts fit user's real-world schedule
- **Progressive Onboarding**: Incremental saving prevents data loss and improves mobile UX
- **Compliance**: Captures health information (injuries, conditions) to ensure safe exercise recommendations

## Architecture

### Design Decisions

#### 1. **Split Controllers**
We separated consultation and availability into two controllers:

**Why**:
- Different resources with different lifecycles
- Consultation: happens during onboarding (once/twice)
- Availability: ongoing management (updated many times)
- RESTful design: `/consultation` and `/availability` as top-level resources
- Cleaner code: each controller under 200 lines, focused responsibility

**Routes**:
```
ConsultationController → /consultation
AvailabilityController → /availability
```

#### 2. **Shared Service**
Both controllers use the same `ConsultationService`:

**Why**:
- Shared business logic (validation, database access)
- Both domains are tightly related (consultation includes availability)
- Simpler to maintain one service initially
- Can split later if needed (when service exceeds 500 lines)

#### 3. **Flexible Answer Storage**
Answers stored as JSON (`valueJson` field):

**Why**:
- Question types are dynamic (defined in database, not hardcoded)
- Same table structure supports: single-choice, multi-choice, scale, time ranges, text, numbers
- Extensible: can add new question types without schema changes
- Mobile-friendly: app can render questions dynamically

#### 4. **"Replace All" Availability Strategy**
When updating availability, we delete existing windows and insert new ones:

**Why**:
- Simpler client logic (send full state, not diffs)
- Atomic transaction prevents partial failures
- No state drift from missed deletes
- Mobile schedule picker naturally produces full state

#### 5. **Minutes from Midnight**
Time stored as integers (0-1439) instead of HH:MM strings:

**Why**:
- Database efficiency (integer vs string)
- Easy computation (duration, overlaps)
- Simple validation (range check 0-1439)
- Scheduler-friendly (direct arithmetic)

## File Structure

```
src/modules/consultation/
├── README.md                           # This file
├── consultation.controller.ts          # /consultation endpoints (7 routes)
├── availability.controller.ts          # /availability endpoints (3 routes)
├── consultation.service.ts             # Business logic (shared by both controllers)
├── consultation.module.ts              # NestJS module registration
└── dtos/
    ├── create-consultation.dto.ts      # Input: create consultation session
    ├── update-consultation.dto.ts      # Input: update answers
    ├── consultation-response.dto.ts    # Output: consultation with answers
    └── availability-window.dto.ts      # Input/Output: availability windows
```

## API Endpoints

### Consultation Routes (`/consultation`)

#### POST /consultation
Create new consultation session.

**Request**:
```json
{
  "answers": [  // Optional - can start empty
    {
      "questionId": "uuid",
      "value": "fat_loss"  // Shape depends on question type
    }
  ]
}
```

**Response**: Full consultation session with answers

**Use Case**: User starts onboarding in mobile app

---

#### GET /consultation/:id
Fetch consultation session by ID.

**Response**:
```json
{
  "id": "uuid",
  "userId": "uuid",
  "status": "pending",
  "startedAt": "2025-01-01T00:00:00Z",
  "completedAt": null,
  "answers": [
    {
      "id": "uuid",
      "questionId": "uuid",
      "question": {
        "code": "GOAL_PRIMARY",
        "prompt": "What is your primary fitness goal?",
        "type": "single",
        "optionsJson": ["fat_loss", "muscle_gain", "performance"]
      },
      "value": "fat_loss",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

**Use Case**: User returns to incomplete consultation

---

#### GET /consultation
Get user's most recent consultation session.

**Response**: Same as GET /:id or `null` if none exist

**Use Case**: Check onboarding status on app launch

---

#### PATCH /consultation/:id
Update consultation answers (partial update).

**Request**:
```json
{
  "answers": [
    {
      "questionId": "uuid",
      "value": ["barbell", "dumbbell"]  // Changed answer
    }
  ]
}
```

**Response**: Updated consultation session

**Use Case**: User goes back and changes previous answers

---

#### POST /consultation/:id/submit-answer
Submit single answer (real-time progress saving).

**Request**:
```json
{
  "questionId": "uuid",
  "value": 7
}
```

**Response**: Updated consultation session

**Use Case**: Mobile saves progress after each question

---

#### POST /consultation/:id/complete
Mark consultation as completed.

**Validation**:
- All required questions must be answered
- Session must be in 'pending' status

**Side Effects**:
- Sets `status = 'completed'`, `completedAt = now()`
- TODO: Triggers AI plan generation (queued job)
- TODO: Sends notification "Your plan is being generated"

**Use Case**: User finishes all questions and submits

---

#### GET /consultation/questions/all
Get all active consultation questions.

**Response**:
```json
[
  {
    "id": "uuid",
    "code": "GOAL_PRIMARY",
    "prompt": "What is your primary fitness goal?",
    "helpText": "Select your main focus",
    "type": "single",
    "optionsJson": ["fat_loss", "muscle_gain", "performance"],
    "isActive": true
  }
]
```

**Use Case**: Mobile fetches questions to render onboarding UI

**Note**: Consider caching with 1 hour TTL (static data)

---

### Availability Routes (`/availability`)

#### POST /availability
Create or replace all availability windows.

**Request**:
```json
{
  "windows": [
    {
      "dayOfWeek": 1,        // Monday
      "startMin": 540,       // 9:00 AM
      "endMin": 1020,        // 5:00 PM
      "priority": 2          // Most preferred (optional, default: 0)
    },
    {
      "dayOfWeek": 3,        // Wednesday
      "startMin": 360,       // 6:00 AM
      "endMin": 720          // 12:00 PM
    }
  ]
}
```

**Empty array**: Clears all availability (on-demand workouts only)

**Validation**:
- No overlapping windows on same day
- `startMin < endMin` for each window
- `dayOfWeek` in range 0-6
- `startMin`, `endMin` in range 0-1439

**Response**: Created windows with database IDs

**Use Case**: User sets/updates weekly workout schedule

---

#### GET /availability
Get user's current availability windows.

**Response**:
```json
[
  {
    "id": "uuid",
    "userId": "uuid",
    "dayOfWeek": 1,
    "startMin": 540,
    "endMin": 1020,
    "priority": 2,
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-01-01T00:00:00Z"
  }
]
```

**Sorted by**: dayOfWeek ASC, startMin ASC

**Use Case**: Display weekly schedule, check if availability set

---

#### DELETE /availability/:id
Delete single availability window.

**Response**: 204 No Content

**Use Case**: Remove one time block without re-sending full schedule

---

## DTOs (Data Transfer Objects)

### Input DTOs

#### CreateConsultationDto
```typescript
{
  answers?: ConsultationAnswerDto[]  // Optional - can start empty
}
```

#### ConsultationAnswerDto
```typescript
{
  questionId: string    // UUID of question
  value: unknown        // Flexible - shape depends on question.type
}
```

**Value formats by question type**:
- `single`: `string` - e.g., `"fat_loss"`
- `multi`: `string[]` - e.g., `["barbell", "dumbbell"]`
- `scale`: `number` - e.g., `7` (1-10 scale)
- `time_range`: `{ dayOfWeek: number, startMin: number, endMin: number }[]`
- `number`: `number` - e.g., `75.5` (weight in kg)
- `text`: `string` - e.g., `"Lower back pain from herniated disc"`
- `enum`: `string` - e.g., `"male"`

#### UpdateConsultationDto
```typescript
{
  answers: ConsultationAnswerDto[]  // Required - at least one answer
}
```

#### AvailabilityWindowDto
```typescript
{
  dayOfWeek: number     // 0=Sunday ... 6=Saturday
  startMin: number      // 0-1439 (minutes from midnight)
  endMin: number        // 0-1439
  priority?: number     // 0-10 (optional, default: 0)
}
```

**Time conversion**:
- 9:00 AM = (9 * 60) + 0 = 540
- 5:00 PM = (17 * 60) + 0 = 1020

#### UpsertAvailabilityDto
```typescript
{
  windows: AvailabilityWindowDto[]  // Full replacement (delete + insert)
}
```

### Output DTOs

#### ConsultationResponseDto
```typescript
{
  id: string
  userId: string
  status: 'pending' | 'completed'
  startedAt: Date
  completedAt: Date | null
  answers: ConsultationAnswerResponseDto[]
  createdAt: Date
  updatedAt: Date
}
```

#### ConsultationAnswerResponseDto
```typescript
{
  id: string
  questionId: string
  question: QuestionDetailsDto    // Embedded for convenience
  value: unknown
  createdAt: Date
  updatedAt: Date
}
```

#### QuestionDetailsDto
```typescript
{
  id: string
  code: string                    // e.g., "GOAL_PRIMARY"
  prompt: string
  helpText: string | null
  type: string
  optionsJson: unknown | null
}
```

#### AvailabilityWindowResponseDto
```typescript
{
  id: string
  userId: string
  dayOfWeek: number
  startMin: number
  endMin: number
  priority: number
  createdAt: Date
  updatedAt: Date
}
```

## Business Logic

### Consultation Flow

1. **Create Session** (`POST /consultation`)
   - Creates `ConsultationSession` record (status: pending)
   - Optionally saves initial answers
   - Transaction: session + answers created atomically

2. **Save Progress** (`PATCH /consultation/:id` or `POST /:id/submit-answer`)
   - Upsert pattern: inserts new answers, updates existing by questionId
   - Transaction: all answers saved together
   - Idempotent: safe to retry

3. **Complete Session** (`POST /consultation/:id/complete`)
   - Validates all required questions answered
   - Checks session is not already completed
   - Sets status='completed', completedAt=now()
   - TODO: Emits event for AI plan generation

### Validation Rules

#### Consultation
- [DONE] User can only access their own consultations
- [DONE] Cannot update completed consultation
- [DONE] QuestionId must exist in database
- [DONE] All required questions must be answered before completion
- [TODO] TODO: Validate value shape matches question.type

#### Availability
- [DONE] User can only manage their own availability
- [DONE] No overlapping windows on same day
- [DONE] startMin < endMin for each window
- [DONE] dayOfWeek in range 0-6
- [DONE] startMin, endMin in range 0-1439
- [DONE] priority in range 0-10
- [NOT SUPPORTED] Does NOT support overnight windows (e.g., 11 PM - 2 AM)
  - Workaround: Split into two windows (Day 1: 23:00-23:59, Day 2: 00:00-02:00)

### Error Handling

#### 400 Bad Request
- Missing required fields
- Invalid UUID format
- Overlapping availability windows
- Invalid time range (startMin >= endMin)
- Required questions not answered (on complete)

#### 401 Unauthorized
- No JWT token
- Invalid/expired JWT token

#### 403 Forbidden
- User attempting to access another user's consultation
- User attempting to delete another user's availability

#### 404 Not Found
- Consultation session not found
- Question not found
- Availability window not found

#### 500 Internal Server Error
- Database connection failure
- Uncaught exceptions

All errors return standard NestJS error format:
```json
{
  "statusCode": 400,
  "message": "Overlapping availability windows on day Monday: 09:00-17:00 overlaps 14:00-18:00",
  "error": "Bad Request"
}
```

## Database Schema

### ConsultationSession
```prisma
model ConsultationSession {
  id            String              @id @default(uuid())
  userId        String
  status        ConsultationStatus  @default(pending)  // pending | completed
  startedAt     DateTime            @default(now())
  completedAt   DateTime?
  responsesJson Json?                                  // Snapshot for audit
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt

  user    User                 @relation(...)
  answers ConsultationAnswer[]

  @@index([userId, status])
}
```

### ConsultationQuestion
```prisma
model ConsultationQuestion {
  id          String   @id @default(uuid())
  code        String   @unique                  // e.g., "GOAL_PRIMARY"
  prompt      String
  helpText    String?
  type        String                            // single|multi|scale|time_range|number|text|enum
  optionsJson Json?                             // For enums/scales
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  answers ConsultationAnswer[]
}
```

### ConsultationAnswer
```prisma
model ConsultationAnswer {
  id         String   @id @default(uuid())
  sessionId  String
  questionId String
  valueJson  Json                                // Flexible answer storage
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  session  ConsultationSession  @relation(...)
  question ConsultationQuestion @relation(...)

  @@unique([sessionId, questionId])              // One answer per question per session
  @@index([sessionId])
  @@index([questionId])
}
```

### AvailabilityWindow
```prisma
model AvailabilityWindow {
  id        String   @id @default(uuid())
  userId    String
  dayOfWeek Int                                   // 0=Sun ... 6=Sat
  startMin  Int                                   // 0-1439 minutes from midnight
  endMin    Int                                   // 0-1439
  priority  Int      @default(0)                  // 0-10 (higher = more preferred)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(...)

  @@index([userId, dayOfWeek])
}
```

## Integration Points

### Auth Module (Your Partner's Work)
- **JwtAuthGuard**: Protects all routes, verifies JWT token
- **CurrentUser decorator**: Extracts `user.id` from JWT payload
- Both controllers use `@CurrentUser('id')` to get authenticated user ID

### Prisma Module (Your Partner's Work)
- **PrismaService**: Shared database access
- **PrismaModule**: Global module providing PrismaService
- Service injects PrismaService for all database operations

### AI Module (Future Integration)
When consultation is completed:
1. Emit event: `consultation.completed` with `{ userId, sessionId }`
2. AI module listens for event
3. Fetches consultation answers + availability
4. Generates workout plan via LLM
5. Stores plan in WorkoutPlan table
6. Sends push notification: "Your plan is ready"

### Scheduler Module (Future Integration)
Workout scheduler queries availability:
```typescript
const windows = await availabilityService.getAvailability(userId);
// Use windows to place workouts at optimal times
```

## Usage Examples

### Mobile Client Flow

#### Onboarding (Create + Submit Answers)
```typescript
// 1. Start consultation
const session = await fetch('/consultation', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ answers: [] })  // Empty initially
});

// 2. User answers questions one by one
for (const question of questions) {
  const answer = await promptUser(question);
  
  // Save progress after each answer
  await fetch(`/consultation/${session.id}/submit-answer`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      questionId: question.id,
      value: answer
    })
  });
}

// 3. Complete consultation
await fetch(`/consultation/${session.id}/complete`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});

// 4. Set availability
await fetch('/availability', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({
    windows: [
      { dayOfWeek: 1, startMin: 540, endMin: 1020, priority: 2 },
      { dayOfWeek: 3, startMin: 360, endMin: 720 }
    ]
  })
});
```

#### Resume Incomplete Consultation
```typescript
// Fetch current consultation
const session = await fetch('/consultation', {
  headers: { 'Authorization': `Bearer ${token}` }
});

if (session.status === 'pending') {
  // Show remaining questions
  const answeredQuestionIds = new Set(session.answers.map(a => a.questionId));
  const remainingQuestions = allQuestions.filter(q => !answeredQuestionIds.has(q.id));
  
  // Continue from where user left off
}
```

#### Update Availability
```typescript
// User changes schedule (e.g., new work hours)
await fetch('/availability', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({
    windows: updatedSchedule  // Full replacement
  })
});
```

### Backend Service Integration

#### AI Plan Generator
```typescript
@Injectable()
export class AiPlanGeneratorService {
  constructor(
    private consultationService: ConsultationService,
  ) {}

  async generatePlan(userId: string) {
    // Fetch consultation data
    const consultation = await this.consultationService.getCurrentSession(userId);
    const availability = await this.consultationService.getAvailability(userId);
    
    // Build context for LLM
    const context = this.buildContext(consultation, availability);
    
    // Generate plan via LLM
    const plan = await this.callLLM(context);
    
    // Store plan in database
    await this.savePlan(userId, plan);
  }
}
```

## Testing

### Unit Tests
```typescript
describe('ConsultationService', () => {
  it('should create consultation session', async () => {
    const result = await service.createSession(userId, dto);
    expect(result.status).toBe('pending');
  });

  it('should prevent overlapping availability windows', async () => {
    const dto = {
      windows: [
        { dayOfWeek: 1, startMin: 540, endMin: 1020 },
        { dayOfWeek: 1, startMin: 900, endMin: 1200 }  // Overlaps
      ]
    };
    await expect(service.upsertAvailability(userId, dto))
      .rejects.toThrow('Overlapping availability windows');
  });
});
```

### E2E Tests
```typescript
describe('/consultation (e2e)', () => {
  it('should complete full consultation flow', async () => {
    // Create session
    const { body: session } = await request(app.getHttpServer())
      .post('/consultation')
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: [] })
      .expect(201);
    
    // Submit answers
    await request(app.getHttpServer())
      .patch(`/consultation/${session.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: testAnswers })
      .expect(200);
    
    // Complete
    await request(app.getHttpServer())
      .post(`/consultation/${session.id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});
```

## Future Enhancements

### Consultation
- [ ] Add `isRequired` field to ConsultationQuestion schema
- [ ] Validate answer value matches question.type
- [ ] Support conditional questions (show Q2 only if Q1 answer is X)
- [ ] Allow re-opening completed consultations for updates
- [ ] Version consultations (track historical changes)
- [ ] Add consultation templates for different user types

### Availability
- [ ] Support overnight windows (cross-midnight)
- [ ] Add temporary overrides (one-time schedule changes)
- [ ] Support location-specific availability (home gym vs commercial gym)
- [ ] Add recurring exceptions (every 3rd Monday)
- [ ] Integrate with calendar APIs (Google Calendar, iCal)
- [ ] Smart availability suggestions based on patterns

### Integration
- [ ] Emit `consultation.completed` event
- [ ] Queue AI plan generation job
- [ ] Send push notification when plan ready
- [ ] Track analytics (completion rate, avg time per question)
- [ ] Add webhook support for external integrations

## Troubleshooting

### Issue: "Consultation session not found"
**Cause**: Session ID is invalid or user doesn't own the session
**Solution**: Verify session ID, check user authentication

### Issue: "Cannot update completed consultation"
**Cause**: Attempting to modify a completed consultation
**Solution**: Create new consultation or add support for re-opening

### Issue: "Overlapping availability windows"
**Cause**: Two windows on same day have overlapping times
**Solution**: Check client-side validation, fix window times

### Issue: "Missing required answers"
**Cause**: Attempting to complete consultation without answering all required questions
**Solution**: Ensure all questions marked as required have answers

### Issue: Questions not showing in mobile app
**Cause**: `isActive = false` on questions or questions not seeded
**Solution**: Check database, ensure questions exist and are active

## Performance Considerations

### Query Optimization
- [DONE] Indexes on `[userId, status]` for consultation queries
- [DONE] Indexes on `[userId, dayOfWeek]` for availability queries
- [DONE] Composite unique index on `[sessionId, questionId]` for answer upserts

### Caching Strategy
- **Questions**: Cache with 1 hour TTL (rarely change)
- **Availability**: Cache with 5 minute TTL (updated occasionally)
- **Consultations**: Don't cache (real-time progress)

### Database Load
- Consultation creation: 1-3 queries (transaction)
- Answer submission: 1-2 queries per answer (upsert)
- Availability update: 2-N queries (delete + insert in transaction)

Expected load: Low (onboarding happens once per user)

## Security

### Authentication
- [DONE] All routes require valid JWT token
- [DONE] `@UseGuards(JwtAuthGuard)` at controller level

### Authorization
- [DONE] User can only access their own consultations
- [DONE] User can only manage their own availability
- [DONE] Ownership verified in every service method

### Data Protection
- [DONE] Health information encrypted at rest (database level)
- [DONE] No PII in logs
- [DONE] Sensitive fields excluded from responses (via `@Expose()` decorators)

### Input Validation
- [DONE] DTOs validate all inputs (class-validator)
- [DONE] UUID validation via `ParseUUIDPipe`
- [DONE] Business logic validation in service layer

## Monitoring

### Key Metrics
- Consultation completion rate (target: >80%)
- Average time to complete consultation (target: <10 minutes)
- Availability setup rate (target: >90%)
- Error rate per endpoint (target: <1%)

### Logging
- All operations logged with user ID and operation type
- Errors logged with stack trace and context
- Security events logged (unauthorized access attempts)

### Alerts
- High error rate (>5% in 5 minutes)
- Slow queries (>1 second)
- Failed AI plan generation after consultation

## Support

For questions or issues:
- Check this README first
- Review API endpoint examples
- Check logs for detailed error messages
- Contact backend team lead

---

**Last Updated**: October 2025
**Module Version**: 1.0.0
**Status**: Production Ready
