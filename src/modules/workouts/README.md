# Workouts Module

Complete workout scheduling and real-time session management for the FitTalk fitness application.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Phase 1: Scheduling](#phase-1-scheduling)
- [Phase 2: Live Sessions](#phase-2-live-sessions)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## Overview

The Workouts Module provides two main features:

1. **Phase 1: Scheduling** - Intelligent workout scheduling that fits workouts into user availability windows
2. **Phase 2: Live Sessions** - Real-time workout tracking with WebSocket support for multi-device synchronization

### Key Features

 **Smart Scheduling**
- Backtracking algorithm with pruning for optimal workout placement
- Respects user availability windows and priorities
- Handles conflicts and provides reasons for unscheduled workouts
- Distributed locking prevents concurrent schedule generation

**Real-Time Tracking**
- WebSocket-based live session updates
- Finite state machine for workout flow control
- Multi-device synchronization
- Redis-backed state persistence with TTL
- Rest timer management
- Custom event broadcasting

 **Production-Ready**
- PostgreSQL for persistent data
- Redis for real-time state and distributed locks
- JWT authentication for HTTP and WebSocket
- Comprehensive error handling
- Idempotent operations
- TypeScript type safety

---

## Architecture

### Module Structure

\`\`\`
src/modules/workouts/
├── scheduling/                    # Phase 1: Scheduling
│   ├── planner.service.ts        # Pure algorithm (no dependencies)
│   ├── scheduling.service.ts     # Orchestration (DB, Redis, Planner)
│   └── scheduling.controller.ts  # HTTP endpoints
├── live/                          # Phase 2: Live Sessions
│   ├── session-state.service.ts  # Finite state machine (Redis)
│   ├── live.service.ts           # Session lifecycle (DB + Redis)
│   ├── live.gateway.ts           # WebSocket server
│   ├── live.controller.ts        # HTTP endpoints
│   └── dtos/                     # Data transfer objects
├── dtos/                          # Shared DTOs
└── workouts.module.ts             # Module definition
\`\`\`

### Technology Stack

- **NestJS** - Framework
- **Fastify** - HTTP server
- **Socket.io** - WebSocket server
- **Prisma** - ORM
- **PostgreSQL** - Persistent storage
- **Redis** - State cache, locks, pub/sub
- **TypeScript** - Type safety

---

## Phase 1: Scheduling

### Purpose

Generate weekly workout schedules that fit into user availability windows using an optimal placement algorithm.

### Key Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | \`/workouts/schedule/week\` | Generate weekly schedule |
| GET | \`/workouts/schedule/week?weekStart=YYYY-MM-DD\` | Get scheduled workouts |
| GET | \`/workouts/schedule/upcoming\` | Get next upcoming workout |
| DELETE | \`/workouts/schedule/:id\` | Cancel a scheduled workout |

### Example Request

\`\`\`http
POST /api/v1/workouts/schedule/week
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "weekStart": "2025-01-20",
  "regenerate": true
}
\`\`\`

---

## Phase 2: Live Sessions

### Purpose

Real-time workout tracking with WebSocket synchronization across multiple devices.

### State Machine

\`\`\`
         ┌──────────┐
         │   idle   │ (initial)
         └────┬─────┘
              │ start-exercise
              ▼
      ┌──────────────┐
   ┌─▶│  exercising  │◀─┐
   │  └───┬──────────┘  │
   │      │ complete-set │ end-rest
   │      ▼              │
   │  ┌─────────┐       │
   └──│ resting │───────┘
      └────┬────┘
           │ pause
           ▼
      ┌─────────┐
      │ paused  │
      └────┬────┘
           │ resume
           └──────────► (back to previous state)

      Any state → completed (terminal)
\`\`\`

### Valid Transitions

- \`idle\` → \`exercising\`, \`completed\`
- \`exercising\` → \`resting\`, \`paused\`, \`completed\`
- \`resting\` → \`exercising\`, \`paused\`, \`completed\`
- \`paused\` → \`exercising\`, \`resting\`, \`completed\`
- \`completed\` → (none - terminal state)

### Key Endpoints

**HTTP** (\`/workouts/live\`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | \`/sessions\` | Create live session |
| GET | \`/sessions\` | List active sessions |
| GET | \`/sessions/:id\` | Get session details |
| GET | \`/sessions/:id/state\` | Get current state (FSM) |
| POST | \`/sessions/:id/end\` | End session |
| POST | \`/sessions/:id/pause\` | Pause session |
| POST | \`/sessions/:id/start-exercise\` | Start exercise |
| POST | \`/sessions/:id/complete-set\` | Complete set |

**WebSocket** (Namespace: \`/live\`)

Client → Server:
- \`join-session\` - Join session room
- \`start-exercise\` - Begin exercise
- \`complete-set\` - Finish set, start rest
- \`end-rest\` - End rest period
- \`pause-session\` - Pause workout
- \`resume-session\` - Resume workout

Server → Client:
- \`connected\` - Connection success
- \`session-joined\` - Joined session
- \`exercise-started\` - Exercise began
- \`set-completed\` - Set finished
- \`rest-ended\` - Rest finished
- \`session-paused\` - Session paused
- \`session-resumed\` - Session resumed

---

## API Reference

### HTTP Examples

**Create Live Session**
\`\`\`http
POST /api/v1/workouts/live/sessions
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "title": "Morning Workout",
  "description": "Upper body strength"
}
\`\`\`

**Get Session State**
\`\`\`http
GET /api/v1/workouts/live/sessions/:id/state
Authorization: Bearer <jwt>

Response:
{
  "sessionId": "uuid",
  "status": "exercising",
  "currentExerciseId": "uuid",
  "currentSetNumber": 2
}
\`\`\`

### WebSocket Example

\`\`\`javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3000/live', {
  auth: { token: 'your-jwt-token' }
});

socket.on('connected', (data) => {
  console.log('Connected:', data);
});

socket.emit('join-session', { sessionId: 'uuid' });
socket.emit('start-exercise', {
  sessionId: 'uuid',
  exerciseId: 'exercise-uuid',
  exerciseIndex: 0
});
\`\`\`

---

## Testing

### Quick Start

\`\`\`bash
# 1. Set JWT token
export JWT_TOKEN="your-jwt-token"

# 2. Run HTTP tests
./test/test-workouts.sh

# 3. Run WebSocket tests
SESSION_ID=\$(curl -s -X POST "http://localhost:3000/api/v1/workouts/live/sessions" \\
  -H "Authorization: Bearer \$JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Test"}' | jq -r '.id')

node test/test-websocket-live.js \$SESSION_ID
\`\`\`

### What Gets Tested

**HTTP Tests (test-workouts.sh)**
- Generate weekly schedule
- Get weekly schedule
- Cancel scheduled workout
- Create/update/end live session
- State transitions (start exercise, complete set, pause, resume)
- Heartbeat and event recording

**WebSocket Tests (test-websocket-live.js)**
- Connection with JWT auth
- Join/leave session rooms
- Real-time state updates
- Exercise flow (start → set → rest → next set)
- Pause/resume functionality

See **[test/WORKOUTS_TESTING.md](../../../test/WORKOUTS_TESTING.md)** for detailed testing guide.

---

## Troubleshooting

### Common Issues

**Session not found**
- Sessions expire after 4 hours in Redis
- Create a new session

**Invalid state transition**
- Check current state: \`GET /sessions/:id/state\`
- See State Machine diagram for valid transitions

**WebSocket disconnects**
- Verify JWT token is set: \`echo \$JWT_TOKEN\`
- Check server logs for auth errors
- Ensure \`SUPABASE_JWT_SECRET\` is configured

**Redis connection failed**
\`\`\`bash
brew services start redis  # macOS
docker-compose up -d       # Docker
redis-cli ping             # Should return PONG
\`\`\`

### Debug Commands

\`\`\`bash
# Check Redis state
redis-cli KEYS "session:state:*"
redis-cli GET "session:state:{sessionId}"

# Check database
npx prisma studio

# Test auth
curl -s http://localhost:3000/api/v1/auth/me \\
  -H "Authorization: Bearer \$JWT_TOKEN" | jq
\`\`\`

---

## Database Schema

**ScheduledWorkout**
- id: UUID
- userId: String (FK → User)
- scheduledAt: DateTime
- status: enum (scheduled, in_progress, completed, cancelled)

**LiveWorkoutSession**
- id: UUID
- userId: String (FK → User)
- startedAt: DateTime
- endedAt: DateTime (nullable)
- stateJson: JSONB
- heartbeatAt: DateTime

**Redis Keys**
- \`session:state:{sessionId}\` - Session FSM state (TTL: 4 hours)
- \`live:sessions:active\` - Set of active session IDs
- \`lock:schedule:{userId}:{week}\` - Distributed lock (TTL: 30s)

---

## Future Enhancements

- [ ] Multi-user sessions (coach-led workouts)
- [ ] Session recording and replay
- [ ] Performance analytics
- [ ] Social features
- [ ] Voice commands
- [ ] Wearable integration

---

**Last Updated:** January 2025  
**Version:** 1.0.0
