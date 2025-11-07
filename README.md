# FitTalk Backend

Backend API for the FitTalk fitness application. Built with NestJS, Fastify, and Supabase.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **pnpm** ([Installation guide](https://pnpm.io/installation))
  ```bash
  npm install -g pnpm
  ```
- **Docker & Docker Compose** ([Download](https://www.docker.com/products/docker-desktop))
- **Git** ([Download](https://git-scm.com/downloads))

## Getting Started (New Collaborators)

### Quick Setup (Recommended)

**The setup script automatically installs all dependencies, configures the environment, and sets up the database. Just run these commands:**

```bash
# 1. Clone the repository
git clone https://github.com/mdeadwiler/Back-End-FitTalk.git
cd Back-End-FitTalk

# 2. Run the automated setup script (installs everything!)
./setup.sh

# 3. Update .env with your Supabase credentials

# 4. Start developing
pnpm run start:dev
```

**That's it!** The API will be available at `http://localhost:3000`

### Manual Setup (Alternative)

<details>
<summary>Click to expand manual setup steps</summary>

#### 1. Clone the Repository

```bash
git clone https://github.com/mdeadwiler/Back-End-FitTalk.git
cd Back-End-FitTalk
```

#### 2. Install Dependencies

```bash
pnpm install
```

#### 3. Environment Setup

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Update the `.env` file with your credentials.

#### 4. Database Setup

Initialize Prisma and run migrations:

```bash
# Generate Prisma client
pnpm prisma generate

# Run migrations
pnpm prisma migrate dev

# (Optional) Seed the database
pnpm prisma db seed
```

#### 5. Start Development Server

```bash
pnpm run start:dev
```

The API will be available at `http://localhost:3000`

</details>

## Tech Stack

### Core Framework
- **NestJS** - Progressive Node.js framework
- **Fastify** - High-performance web server
- **TypeScript** - Type-safe JavaScript

### Database & ORM
- **PostgreSQL** (via Supabase)
- **Prisma** - Next-generation ORM

### Authentication
- **Supabase Auth** - Authentication & authorization
- **Passport** - Authentication middleware
- **JWT** - JSON Web Tokens
- **JWKS-RSA** - JWT verification

### Security & Performance
- **@fastify/helmet** - Security headers
- **@fastify/cors** - CORS handling
- **@fastify/compress** - Response compression
- **@nestjs/throttler** - Rate limiting

### Real-time & Scheduling
- **Socket.io** - WebSocket support
- **@nestjs/websockets** - WebSocket integration
- **@nestjs/schedule** - Task scheduling

### Caching & Queues
- **Redis** - In-memory data store
- **cache-manager** - Caching abstraction

### Validation & DTOs
- **class-validator** - Validation decorators
- **class-transformer** - Object transformation

### HTTP & Integrations
- **Axios** - HTTP client
- **@nestjs/axios** - Axios integration

## Available Scripts

```bash
# Development
pnpm run start:dev        # Start in watch mode
pnpm run start:debug      # Start in debug mode

# Production
pnpm run build            # Build for production
pnpm run start:prod       # Run production build

# Testing
pnpm run test             # Run unit tests
pnpm run test:watch       # Run tests in watch mode
pnpm run test:e2e         # Run end-to-end tests
pnpm run test:cov         # Generate test coverage

# Code Quality
pnpm run lint             # Run ESLint
pnpm run format           # Format code with Prettier

# Database
pnpm prisma studio        # Open Prisma Studio
pnpm prisma migrate dev   # Create and apply migrations
pnpm prisma generate      # Generate Prisma Client
```

## Project Structure

```
Back-End-FitTalk/
├── src/
│   ├── modules/          # Feature modules
│   ├── common/           # Shared utilities, guards, interceptors
│   ├── config/           # Configuration files
│   ├── main.ts           # Application entry point
│   └── app.module.ts     # Root module
├── prisma/
│   └── schema.prisma     # Database schema
├── test/                 # E2E tests
├── .env                  # Environment variables (create from .env.example)
└── package.json
```

## Architecture Overview

### Error Handling & Logging

The application implements production-ready error handling with comprehensive logging across all services. This ensures reliable operations, consistent error responses, and complete audit trails.

#### Centralized Error Handler

Location: [src/common/utils/prisma-error.handler.ts](src/common/utils/prisma-error.handler.ts)

All database operations use a centralized error handler that:
- Maps Prisma errors to appropriate HTTP exceptions (400, 404, 409, 500)
- Provides consistent error response format: `{message: string, error: string, details?: any}`
- Logs all errors with context for debugging
- Handles edge cases (validation errors, connection errors, unknown errors)

Example Prisma error mappings:
- P2002 (unique constraint) maps to 409 Conflict
- P2025 (record not found) maps to 404 Not Found
- P2003 (foreign key constraint) maps to 400 Bad Request

#### Standardized Service Pattern

All service methods follow this pattern:

```typescript
async methodName(userId: string, data: Dto) {
  try {
    this.logger.log(`Starting operation: ${context}`);

    // Business logic and database operations
    const result = await this.prisma.model.operation(...);

    this.logger.log(`Successfully completed operation`);
    return result;
  } catch (error) {
    // Re-throw custom exceptions (NotFoundException, ForbiddenException, etc.)
    if (error instanceof NotFoundException) {
      throw error;
    }
    // Handle all Prisma errors centrally
    handlePrismaError(error, this.logger, 'operation description');
  }
}
```

#### Services with Standardized Error Handling

The following services have been updated with comprehensive error handling:

1. **Authentication & User Management** ([auth.service.ts](src/modules/auth/auth.service.ts))
   - User profile operations
   - Session management
   - Device registration and management
   - 10 methods with full error handling

2. **Fitness Goals** ([goals.service.ts](src/modules/goals/goals.service.ts))
   - Goal CRUD operations
   - Goal status transitions
   - 6 methods with full error handling

3. **Workout Programs** ([programs.service.ts](src/modules/programs/programs.service.ts))
   - Program, day, and item management
   - Program cloning with deep copy
   - 14 methods with full error handling

4. **Workout Logging** ([workout-logging.service.ts](src/modules/workout-logging/workout-logging.service.ts))
   - Workout log creation with sets
   - Historical queries with pagination
   - Transaction-based updates
   - 5 methods with full error handling

5. **Workout Scheduling** ([scheduling.service.ts](src/modules/workouts/scheduling/scheduling.service.ts))
   - Week schedule generation with backtracking algorithm
   - Distributed lock management for concurrent operations
   - 7 methods with full error handling

6. **Live Workout Sessions** ([live.service.ts](src/modules/workouts/live/live.service.ts))
   - Real-time session management
   - Redis + Prisma coordination
   - Differentiated error handling for critical vs non-critical Redis operations
   - 9 methods with full error handling

7. **Session State Machine** ([session-state.service.ts](src/modules/workouts/live/session-state.service.ts))
   - Finite state machine for workout states
   - Redis-backed state persistence
   - TTL management and cleanup
   - 11 methods with full error handling

8. **Nutrition Module** (5 services)
   - Already implements sophisticated error handling with custom domain exceptions
   - Detailed Prisma error code handling
   - No changes required

9. **Consultation Module** ([consultation.service.ts](src/modules/consultation/consultation.service.ts))
   - Already implements comprehensive error handling with transactions
   - No changes required

#### Redis Error Handling Strategy

Services that use Redis (live sessions, scheduling locks) implement a differentiated error handling strategy:

**Critical Redis Operations** (session state initialization):
```typescript
try {
  await this.sessionState.initializeState(session.id);
} catch (redisError) {
  this.logger.error(`Redis error: ${context}`, redisError);
  throw new InternalServerErrorException({
    message: 'Failed to initialize session state',
    error: 'RedisError',
  });
}
```

**Non-Critical Redis Operations** (metrics, tracking):
```typescript
try {
  await this.redis.sAdd(this.ACTIVE_SESSIONS_KEY, session.id);
} catch (redisError) {
  this.logger.error(`Redis error: ${context}`, redisError);
  // Log but continue - non-critical operation
}
```

This ensures the application remains operational even during partial Redis failures.

#### Logging & Audit Trail

All services implement structured logging:
- Operation start and completion logs
- Security audit logs (ownership verification, access attempts)
- Error logs with full context and stack traces
- Configurable log levels (debug, info, warn, error)

Example audit trail for a workout log creation:
```
[INFO] Creating workout log for user abc123
[INFO] Validated plan/day/item references
[INFO] Successfully created workout log xyz789
```

#### Benefits

1. **Consistent Error Responses**: All endpoints return standardized error format
2. **Complete Audit Trail**: All operations logged with context
3. **Easier Debugging**: Centralized error handling with detailed logging
4. **Security**: Sensitive errors (like database constraints) never exposed to clients
5. **Reliability**: Graceful degradation with differentiated error handling
6. **Maintainability**: Single source of truth for error handling logic

### Rate Limiting & API Protection

The application implements production-ready, distributed rate limiting to protect against abuse and ensure fair resource allocation across all users.

#### Architecture

**Location:** [src/common/guards/throttler/](src/common/guards/throttler/)

The rate limiting system consists of three core components:

1. **Centralized Configuration** ([throttler.config.ts](src/common/guards/throttler/throttler.config.ts))
   - 20+ predefined rate limit configurations organized by risk level
   - Environment-based overrides (development, production, test)
   - Type-safe configuration keys for compile-time safety

2. **Custom Throttler Guard** ([custom-throttler.guard.ts](src/common/guards/throttler/custom-throttler.guard.ts))
   - Extends NestJS `ThrottlerGuard` with enhanced features
   - Structured logging for all rate limit violations
   - Proper HTTP 429 responses with `Retry-After` headers
   - Per-user rate limiting (not just per-IP)
   - Metrics tracking hooks for monitoring integration

3. **Semantic Decorators** ([throttler.decorators.ts](src/common/guards/throttler/throttler.decorators.ts))
   - 15+ self-documenting decorators for type-safe rate limiting
   - Clear intent: `@HighRiskEndpoint()`, `@FrequentRead()`, `@LiveWorkoutEndpoint('heartbeat')`
   - Easy to adjust limits globally without touching controllers

#### Redis-Backed Distributed Rate Limiting

Rate limits are stored in Redis, ensuring:
- **Multi-instance support**: Rate limits work correctly across horizontal scaling
- **High performance**: Sub-millisecond lookups
- **Automatic expiry**: TTL-based cleanup prevents memory leaks
- **Production-ready**: Battle-tested storage mechanism

Configuration in [app.module.ts](src/app.module.ts):
```typescript
ThrottlerModule.forRootAsync({
  imports: [ConfigModule, RedisModule],
  inject: [ConfigService, REDIS_CLIENT],
  useFactory: (config: ConfigService, redis: RedisClientType) => ({
    throttlers: [
      {
        ttl: config.get('throttle.global.ttl', 60000),
        limit: config.get('throttle.global.limit', 10),
      },
    ],
    storage: new ThrottlerStorageRedisService(redis),
  }),
}),
```

#### Rate Limit Tiers

| Risk Level | Limit | Use Case | Example Endpoints |
|------------|-------|----------|-------------------|
| **Critical Risk** | 3/min | Nuclear options that affect entire account | Revoke all sessions |
| **High Risk** | 5/min | Security-sensitive or expensive operations | Session revocation, program deletion, schedule generation |
| **Standard Mutation** | 10/min | Normal CRUD operations | Create/update/delete resources |
| **Frequent Mutation** | 20-30/min | Common user actions during active use | Workout logging, meal tracking |
| **Standard Read** | 60/min | Normal GET operations | User data, session lists |
| **Frequent Read** | 100/min | High-traffic or cacheable data | Current user, static content |
| **Live Workout** | 50-120/min | Real-time workout session operations | Heartbeat (120/min), set completion (50/min) |
| **Health Check** | 300/min | Monitoring and uptime checks | `/health` endpoints |

#### Example Usage

```typescript
@Controller('auth')
export class AuthController {
  @Get('me')
  @FrequentRead() // 100/min - frequently accessed by frontend
  async getCurrentUser() { }

  @Delete('sessions/:sessionId')
  @HighRiskEndpoint() // 5/min - security sensitive
  async revokeSession() { }

  @Post('sessions/revoke-others')
  @CriticalRiskEndpoint() // 3/min - logs out everywhere
  async revokeOtherSessions() { }
}
```

```typescript
@Controller('workouts/live')
export class LiveController {
  @Post('sessions/:id/heartbeat')
  @LiveWorkoutEndpoint('heartbeat') // 120/min - every 30-60s
  async recordHeartbeat() { }

  @Post('sessions/:id/complete-set')
  @LiveWorkoutEndpoint('set') // 50/min - completing sets
  async completeSet() { }
}
```

#### Rate Limit Response Format

When a rate limit is exceeded, the API returns:

**HTTP 429 Too Many Requests**
```json
{
  "statusCode": 429,
  "message": "Too many requests. Please try again in 42 seconds.",
  "error": "TooManyRequests",
  "details": {
    "limit": 10,
    "windowMs": 60000,
    "retryAfterSeconds": 42
  }
}
```

**Response Headers:**
- `Retry-After`: Seconds until the user can retry
- `X-RateLimit-Limit`: Maximum requests allowed in window
- `X-RateLimit-Remaining`: Requests remaining in current window (0 when exceeded)
- `X-RateLimit-Reset`: Timestamp when the limit resets

#### Logging & Monitoring

All rate limit violations are logged with full context:

```
[WARN] Rate limit exceeded: User abc123 | IP 192.168.1.1 | Endpoint: POST /api/v1/auth/sessions/revoke-others | Limit: 3/60000ms
```

Metrics tracking hooks are included for future integration with:
- Prometheus
- Datadog
- CloudWatch
- Grafana

#### Environment-Based Limits

The system supports environment-specific rate limits:

- **Production**: Configured limits (strict)
- **Development**: 10x limits (lenient for testing)
- **Test**: Effectively unlimited (99999/min)

Configure via `getEnvironmentAdjustedLimit()` in [throttler.config.ts](src/common/guards/throttler/throttler.config.ts).

#### Implementation Status

✅ **Completed:**
- Infrastructure setup (Redis storage, custom guard, decorators)
- Auth controller (11 endpoints)
- Centralized configuration with 20+ rate limit profiles

⏳ **In Progress:**
- Remaining 7 controllers (63 endpoints)
- WebSocket rate limiting for Live Gateway (10 events)

📋 **Implementation Guide:** See [RATE_LIMITING_IMPLEMENTATION_GUIDE.md](RATE_LIMITING_IMPLEMENTATION_GUIDE.md) for detailed controller-by-controller implementation instructions.

#### Benefits

1. **DDoS Protection**: Prevents abuse and resource exhaustion
2. **Fair Resource Allocation**: Ensures all users get equitable API access
3. **Graceful Degradation**: System remains operational under load
4. **User-Friendly Errors**: Clear messages with retry guidance
5. **Production-Ready**: Distributed, scalable, battle-tested architecture
6. **Observable**: Comprehensive logging and metrics tracking
7. **Maintainable**: Centralized configuration, semantic decorators

## Development Workflow

1. **Create a new feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow existing code patterns
   - Write tests for new features
   - Update documentation as needed

3. **Run quality checks**
   ```bash
   pnpm run lint
   pnpm run test
   pnpm run build
   ```

4. **Commit and push**
   ```bash
   git add .
   git commit -m "Description of changes"
   git push origin feature/your-feature-name
   ```

5. **Create a Pull Request**

## Docker Setup (Optional)

To run the application with Docker:

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down
```

## Contributing

1. Ensure all tests pass
2. Follow the existing code style
3. Update documentation for new features
4. Keep commits atomic and well-described

## Support

For questions or issues, please contact the development team or open an issue on GitHub.

## License

UNLICENSED - Private repository
