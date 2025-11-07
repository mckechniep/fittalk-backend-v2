# Rate Limiting Implementation Guide

## Completed Work 

### Phase 1: Infrastructure (100% Complete)
1.  **Created `src/common/guards/throttler/throttler.config.ts`**
   - 20+ centralized rate limit configurations
   - Environment-based overrides (dev/prod/test)
   - Type-safe configuration keys

2.  **Created `src/common/guards/throttler/custom-throttler.guard.ts`**
   - Enhanced throttler guard with logging
   - Proper Retry-After headers
   - Metrics tracking hooks
   - User-friendly error messages

3.  **Created `src/common/guards/throttler/throttler.decorators.ts`**
   - 15+ semantic decorators for type-safe rate limiting
   - Self-documenting code
   - Easy to adjust limits globally

4.  **Configured `src/app.module.ts`**
   - Redis storage integration for distributed rate limiting
   - Custom throttler guard registered globally
   - Production-ready configuration

5.  **Applied rate limits to Auth Controller (11 endpoints)**
   - All endpoints properly decorated
   - Risk-based limits applied

### Phase 2: Apply Rate Limits to Remaining Controllers

## Implementation Pattern

For each controller, follow this pattern:

### 1. Add Imports

```typescript
import {
  FrequentRead,
  ReadEndpoint,
  StandardCreate,
  StandardUpdate,
  StandardDelete,
  FrequentMutation,
  HighFrequencyMutation,
  ExpensiveOperation,
  LiveWorkoutEndpoint,
  ConsultationAnswer,
  ConsultationComplete,
  CustomRateLimit,
} from '../../common/guards/throttler/throttler.decorators';
```

### 2. Apply Decorators Based on Operation Type

```typescript
// READ Operations
@Get('endpoint')
@FrequentRead() // 60/min for frequently accessed data
async getEndpoint() { }

@Get('endpoint2')
@ReadEndpoint() // 100/min for high-traffic reads
async getEndpoint2() { }

// CREATE Operations
@Post('endpoint')
@StandardCreate() // 10/min for standard creates
async createEndpoint() { }

@Post('frequent-endpoint')
@HighFrequencyMutation() // 30/min for frequent operations
async createFrequentEndpoint() { }

// UPDATE Operations
@Put('endpoint')
@StandardUpdate() // 10/min
async updateEndpoint() { }

@Patch('frequent-endpoint')
@FrequentMutation() // 20/min
async updateFrequentEndpoint() { }

// DELETE Operations
@Delete('endpoint')
@StandardDelete() // 10/min
async deleteEndpoint() { }

// EXPENSIVE Operations
@Post('expensive')
@ExpensiveOperation() // 5/min for computationally expensive ops
async expensiveEndpoint() { }

// LIVE WORKOUT Operations
@Post('sessions/:id/heartbeat')
@LiveWorkoutEndpoint('heartbeat') // 120/min
async heartbeat() { }

@Post('sessions/:id/complete-set')
@LiveWorkoutEndpoint('set') // 50/min
async completeSet() { }

// CONSULTATION Operations
@Post('consultation/:id/answer')
@ConsultationAnswer() // 30/min
async submitAnswer() { }

@Post('consultation/:id/complete')
@ConsultationComplete() // 5/min
async complete() { }
```

---

## Controller-Specific Implementation Guide

### 1. Consultation Controller (`consultation.controller.ts`)

**Endpoints (7):**
```typescript
@Get() // All consultations
@ReadEndpoint() // 60/min

@Get(':id') // Get specific consultation
@ReadEndpoint() // 60/min

@Post() // Create consultation
@StandardCreate() // 10/min

@Patch(':id') // Update consultation
@FrequentMutation() // 20/min

@Post(':id/submit-answer') // Submit answer
@ConsultationAnswer() // 30/min - users answering multiple questions

@Post(':id/complete') // Complete consultation
@ConsultationComplete() // 5/min - finalizes onboarding

@Get('questions/all') // Get all questions
@FrequentRead() // 100/min - cacheable static data
```

---

### 2. Availability Controller (`availability.controller.ts`)

**Endpoints (3):**
```typescript
@Get() // Get availability windows
@ReadEndpoint() // 60/min

@Post() // Create availability
@StandardCreate() // 10/min

@Delete(':id') // Delete availability
@StandardDelete() // 10/min
```

---

### 3. Workout Logging Controller (`workout-logging.controller.ts`)

**Endpoints (5):**
```typescript
@Get() // Get workout logs (with pagination)
@ReadEndpoint() // 60/min

@Get(':id') // Get specific log
@ReadEndpoint() // 60/min

@Post() // Create workout log
@HighFrequencyMutation() // 30/min - users log workouts frequently

@Patch(':id') // Update workout log
@FrequentMutation() // 20/min

@Delete(':id') // Delete workout log
@StandardDelete() // 10/min
```

---

### 4. Programs Controller (`programs.controller.ts`)

**Endpoints (14):**
```typescript
// Program CRUD
@Get() // Get all programs
@ReadEndpoint() // 60/min

@Get(':id') // Get specific program
@ReadEndpoint() // 60/min

@Post() // Create program
@StandardCreate() // 10/min

@Patch(':id') // Update program
@StandardUpdate() // 10/min

@Patch(':id/status') // Update program status
@StandardUpdate() // 10/min

@Delete(':id') // Delete program
@ExpensiveOperation() // 5/min - cascading delete

@Post(':id/clone') // Clone program
@ExpensiveOperation() // 5/min - deep copy operation

// Workout Day CRUD
@Post(':id/days') // Create workout day
@FrequentMutation() // 20/min

@Patch(':id/days/:dayId') // Update workout day
@FrequentMutation() // 20/min

@Delete(':id/days/:dayId') // Delete workout day
@StandardDelete() // 10/min

// Workout Item CRUD
@Post(':id/days/:dayId/items') // Create workout item
@HighFrequencyMutation() // 30/min - adding exercises to plan

@Patch(':id/days/:dayId/items/:itemId') // Update workout item
@HighFrequencyMutation() // 30/min

@Delete(':id/days/:dayId/items/:itemId') // Delete workout item
@FrequentMutation() // 20/min

@Post(':id/days/:dayId/items/:itemId/reorder') // Reorder items
@FrequentMutation() // 20/min
```

---

### 5. Goals Controller (`goals.controller.ts`)

**Endpoints (6):**
```typescript
@Get() // Get all goals
@ReadEndpoint() // 60/min

@Get(':id') // Get specific goal
@ReadEndpoint() // 60/min

@Post() // Create goal
@StandardCreate() // 10/min

@Patch(':id') // Update goal
@FrequentMutation() // 20/min

@Patch(':id/status') // Update goal status
@FrequentMutation() // 20/min

@Delete(':id') // Delete goal
@StandardDelete() // 10/min
```

---

### 6. Live Workouts Controller (`live.controller.ts`)

**Endpoints (14):**
```typescript
// Session Management
@Get('sessions') // Get all sessions
@ReadEndpoint() // 60/min

@Get('sessions/:id') // Get specific session
@ReadEndpoint() // 60/min

@Post('sessions') // Create session
@LiveWorkoutEndpoint('create') // 15/min

@Post('sessions/:id/end') // End session
@LiveWorkoutEndpoint('end') // 5/min - critical operation

@Delete('sessions/:id') // Delete session
@StandardDelete() // 10/min

// Session State Management
@Get('sessions/:id/state') // Get session state
@LiveWorkoutEndpoint('query') // 120/min - frequent polling

@Post('sessions/:id/pause') // Pause session
@LiveWorkoutEndpoint('state') // 30/min

@Post('sessions/:id/resume') // Resume session
@LiveWorkoutEndpoint('state') // 30/min

// Exercise Flow
@Post('sessions/:id/start-exercise') // Start exercise
@LiveWorkoutEndpoint('state') // 30/min

@Post('sessions/:id/complete-set') // Complete set
@LiveWorkoutEndpoint('set') // 50/min - completing sets during workout

@Post('sessions/:id/end-rest') // End rest period
@LiveWorkoutEndpoint('rest') // 50/min

// Real-time Tracking
@Post('sessions/:id/heartbeat') // Heartbeat
@LiveWorkoutEndpoint('heartbeat') // 120/min - every 30-60 seconds

@Post('sessions/:id/events') // Emit event
@LiveWorkoutEndpoint('event') // 20/min

@Get('sessions/:id/summary') // Get session summary
@ReadEndpoint() // 60/min
```

---

### 7. Scheduling Controller (`scheduling.controller.ts`)

**Endpoints (4):**
```typescript
@Get('week') // Get week schedule
@ReadEndpoint() // 60/min

@Post('week') // Generate week schedule
@ExpensiveOperation() // 5/min - backtracking algorithm, computationally expensive

@Get('upcoming') // Get upcoming workouts
@ReadEndpoint() // 60/min

@Delete(':id') // Delete scheduled workout
@StandardDelete() // 10/min
```

---

### 8. Nutrition Controller (`nutrition.controller.ts`)

**Note:** Nutrition controller already has custom `@Throttle()` decorators applied. You can either:
1. Leave as-is (already working)
2. Replace with semantic decorators for consistency

**Current throttling (from exploration):**
- Food CRUD: 10-20/min
- Meal CRUD: 30/min
- Target CRUD: 10-20/min
- Grocery CRUD: 20-30/min
- All GET endpoints: 100/min

**Recommended migration (optional):**
```typescript
// Replace existing @Throttle() with semantic decorators
@Get('foods')
@FrequentRead() // 100/min

@Post('foods')
@StandardCreate() // 10/min

@Patch('foods/:id')
@FrequentMutation() // 20/min

@Post('meals')
@HighFrequencyMutation() // 30/min - frequent meal logging

// etc...
```

---

## Phase 3: WebSocket Rate Limiting (Live Gateway)

**File:** `src/modules/workouts/live/live.gateway.ts`

WebSocket rate limiting requires custom implementation. Here's the pattern:

### 1. Create WebSocket Rate Limiter Service

```typescript
// src/common/guards/throttler/websocket-rate-limiter.service.ts
import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { REDIS_CLIENT } from '../../redis/redis.module';
import type { RedisClientType } from 'redis';

@Injectable()
export class WebSocketRateLimiterService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClientType) {}

  async checkLimit(
    userId: string,
    event: string,
    limit: number,
    ttlMs: number,
  ): Promise<boolean> {
    const key = `ws:ratelimit:${userId}:${event}`;
    const count = await this.redis.incr(key);

    if (count === 1) {
      await this.redis.pExpire(key, ttlMs);
    }

    return count <= limit;
  }
}
```

### 2. Apply to Gateway

```typescript
// In live.gateway.ts
import { WebSocketRateLimiterService } from '../../common/guards/throttler/websocket-rate-limiter.service';
import { RATE_LIMITS } from '../../common/guards/throttler/throttler.config';

@WebSocketGateway({ namespace: 'live' })
export class LiveGateway {
  constructor(
    private readonly rateLimiter: WebSocketRateLimiterService,
  ) {}

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(client: Socket, data: any) {
    const userId = client.data.userId;
    const canProceed = await this.rateLimiter.checkLimit(
      userId,
      'heartbeat',
      RATE_LIMITS.LIVE_HEARTBEAT.limit,
      RATE_LIMITS.LIVE_HEARTBEAT.ttl,
    );

    if (!canProceed) {
      return {
        event: 'error',
        data: { message: 'Rate limit exceeded' },
      };
    }

    // Process heartbeat...
  }

  // Apply to all 10 WebSocket events...
}
```

### WebSocket Events to Rate Limit:
1. `join-session` - 60/min
2. `leave-session` - 60/min
3. `start-exercise` - 30/min
4. `complete-set` - 50/min
5. `end-rest` - 50/min
6. `pause-session` - 30/min
7. `resume-session` - 30/min
8. `end-session` - 5/min
9. `emit-event` - 20/min
10. `heartbeat` - 120/min
11. `get-state` - 120/min

---

## Phase 4: Testing

### Manual Testing

```bash
# Test rate limiting with curl
for i in {1..15}; do
  curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/auth/me
  echo "Request $i"
  sleep 0.5
done

# Should see 429 errors after 10 requests (global limit)
# Or after 60 requests if using @FrequentRead()
```

### E2E Test Example

```typescript
// test/rate-limiting.e2e-spec.ts
describe('Rate Limiting (e2e)', () => {
  it('should enforce rate limits on auth endpoints', async () => {
    const requests = [];

    for (let i = 0; i < 70; i++) {
      requests.push(
        request(app.getHttpServer())
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${token}`)
      );
    }

    const responses = await Promise.all(requests);
    const rateLimitedResponses = responses.filter(r => r.status === 429);

    expect(rateLimitedResponses.length).toBeGreaterThan(0);
    expect(rateLimitedResponses[0].headers['retry-after']).toBeDefined();
  });
});
```

---

## Verification Checklist

###  Infrastructure
- [ ] Redis storage configured in app.module.ts
- [ ] Custom throttler guard registered globally
- [ ] Centralized rate limit configuration file created
- [ ] Custom decorators created

###  Controllers (Complete)
- [x] Auth Controller (11 endpoints)
- [ ] Consultation Controller (7 endpoints)
- [ ] Availability Controller (3 endpoints)
- [ ] Workout Logging Controller (5 endpoints)
- [ ] Programs Controller (14 endpoints)
- [ ] Goals Controller (6 endpoints)
- [ ] Live Workouts Controller (14 endpoints)
- [ ] Scheduling Controller (4 endpoints)
- [ ] Nutrition Controller (18 endpoints - already has throttling)

###  WebSocket Gateway
- [ ] WebSocket rate limiter service created
- [ ] Applied to all 10 gateway events

###  Documentation
- [ ] README updated with rate limiting section
- [ ] API documentation includes rate limit info

###  Testing
- [ ] Manual testing performed
- [ ] E2E tests written for rate limiting
- [ ] Verified proper 429 responses with Retry-After headers

---

## Production Considerations

1. **Monitor Rate Limit Hits**
   - Track 429 responses per endpoint
   - Alert on unusual patterns
   - Adjust limits based on actual usage

2. **Environment-Based Limits**
   - Use `getEnvironmentAdjustedLimit()` in config
   - Development: 10x limits for testing
   - Test: Effectively unlimited
   - Production: Configured limits

3. **User Tier-Based Limits** (Future Enhancement)
   - Free users: Standard limits
   - Premium users: Higher limits
   - Implement custom logic in CustomThrottlerGuard

4. **Metrics Integration**
   - Implement metrics tracking in CustomThrottlerGuard
   - Send to Prometheus, Datadog, CloudWatch, etc.
   - Track: rate_limit_violations, rate_limit_hits

5. **Documentation**
   - Document rate limits in API docs
   - Include rate limit headers in responses:
     - `X-RateLimit-Limit`
     - `X-RateLimit-Remaining`
     - `X-RateLimit-Reset`
     - `Retry-After`

---

## Quick Reference: Decorator Selection

| Operation Type | Decorator | Limit | Use Case |
|----------------|-----------|-------|----------|
| Health checks | `@HealthCheckEndpoint()` | 300/min | Monitoring systems |
| Frequent reads | `@FrequentRead()` | 100/min | High-traffic data |
| Standard reads | `@ReadEndpoint()` | 60/min | Normal GET operations |
| Standard create | `@StandardCreate()` | 10/min | POST operations |
| Standard update | `@StandardUpdate()` | 10/min | PUT/PATCH operations |
| Standard delete | `@StandardDelete()` | 10/min | DELETE operations |
| Frequent mutation | `@FrequentMutation()` | 20/min | Common updates |
| High-frequency mutation | `@HighFrequencyMutation()` | 30/min | Very frequent ops |
| Expensive operation | `@ExpensiveOperation()` | 5/min | CPU/memory intensive |
| High risk | `@HighRiskEndpoint()` | 5/min | Security sensitive |
| Critical risk | `@CriticalRiskEndpoint()` | 3/min | Nuclear options |
| Live workout | `@LiveWorkoutEndpoint(type)` | Varies | Real-time workout ops |
| Consultation | `@ConsultationAnswer()` | 30/min | Onboarding answers |
| Custom | `@CustomRateLimit(ttl, limit)` | Custom | Special cases |

---

## Next Steps

1. **Apply rate limits to remaining 7 controllers** using the patterns above
2. **Implement WebSocket rate limiting** for Live Gateway
3. **Update README** with rate limiting documentation
4. **Test thoroughly** in development environment
5. **Monitor in production** and adjust limits based on actual usage

---

## Support

- Centralized config: [throttler.config.ts](src/common/guards/throttler/throttler.config.ts)
- Custom guard: [custom-throttler.guard.ts](src/common/guards/throttler/custom-throttler.guard.ts)
- Decorators: [throttler.decorators.ts](src/common/guards/throttler/throttler.decorators.ts)
- Example implementation: [auth.controller.ts](src/modules/auth/auth.controller.ts)
