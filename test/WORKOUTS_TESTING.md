# Workout Module Testing Guide

Complete guide for testing the **Phase 1 (Scheduling)** and **Phase 2 (Live Sessions)** implementations.

---

## Prerequisites

### 1. Required Tools
```bash
# jq (JSON processor for bash scripts)
brew install jq  # macOS
# OR
sudo apt-get install jq  # Ubuntu

# socket.io-client (for WebSocket tests)
npm install socket.io-client
```

### 2. Services Running
Before testing, ensure these services are running:

```bash
# PostgreSQL
psql -U postgres -c "SELECT 1"  # Should return 1

# Redis
redis-cli ping  # Should return PONG

# Application (in dev mode)
npm run start:dev  # Should start on http://localhost:3000
```

### 3. Database Setup
Ensure your database is migrated:
```bash
npx prisma migrate dev
npx prisma generate
```

### 4. Environment Variables
Check your `.env` file has:
```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
SUPABASE_URL=https://...
SUPABASE_JWT_SECRET=...
PORT=3000
```

### 5. Authentication Token
You need a valid JWT token from Supabase:

**Option A: Get from existing user session**
```bash
# Login via your app and copy the JWT from localStorage or network tab
export JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Option B: Generate test token (for development)**
```bash
# Use the auth manual test
npm run test:auth
# Copy the token from the output
export JWT_TOKEN="<token>"
```

---

## Test Files Overview

| File | Purpose | Tests |
|------|---------|-------|
| `test-workouts.sh` | HTTP API tests | All REST endpoints (Phase 1 + 2) |
| `test-websocket-live.js` | WebSocket tests | Real-time events (Phase 2 only) |

---

## Running Tests

### Test 1: HTTP API Endpoints (Comprehensive)

Tests all REST endpoints for scheduling and live sessions.

```bash
# Set your JWT token
export JWT_TOKEN="your-jwt-token-here"

# Run the test script
./test/test-workouts.sh
```

**What it tests:**
- ✅ Phase 1: Scheduling
  - Generate weekly schedule
  - Get weekly schedule
  - Get upcoming workout
  - Cancel scheduled workout
- ✅ Phase 2: Live Sessions
  - Create session
  - Get session details
  - List active sessions
  - Get session state (FSM)
  - Start exercise (idle → exercising)
  - Complete set (exercising → resting)
  - End rest (resting → exercising)
  - Pause session (exercising → paused)
  - Resume session (paused → exercising)
  - Record heartbeat
  - Record custom events
  - Update session metadata
  - End session

**Expected output:**
```
========================================
  WORKOUT MODULE TEST SUITE
========================================

✓ JWT_TOKEN is set
✓ jq is installed

0. Testing server health...
{
  "status": "ok"
}
✓ Server is healthy

========================================
  PHASE 1: SCHEDULING TESTS
========================================

1. Generate Weekly Schedule (POST /workouts/schedule/week)
{
  "scheduled": [...],
  "unscheduled": [...],
  "summary": {...}
}
✓ Schedule generated successfully

...

========================================
  TEST SUMMARY
========================================

✅ All tests completed!
```

---

### Test 2: WebSocket Events (Real-time)

Tests the WebSocket gateway for real-time session updates.

**Step 1: Create a session first**
```bash
export JWT_TOKEN="your-jwt-token-here"

# Create a live session and capture the ID
SESSION_ID=$(curl -s -X POST "http://localhost:3000/api/v1/workouts/live/sessions" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"WS Test Session","description":"Testing WebSocket"}' \
  | jq -r '.id')

echo "Session ID: $SESSION_ID"
```

**Step 2: Run WebSocket tests**
```bash
# Run the WebSocket test with the session ID
node test/test-websocket-live.js $SESSION_ID
```

**What it tests:**
- ✅ WebSocket connection with JWT auth
- ✅ Join/leave session rooms
- ✅ Real-time state transitions
- ✅ Exercise start/stop events
- ✅ Set completion with rest timer
- ✅ Pause/resume events
- ✅ Custom event broadcasting
- ✅ Heartbeat mechanism

**Expected output:**
```
========================================
  WEBSOCKET LIVE SESSION TEST
========================================

Connecting to: http://localhost:3000/live
Session ID: 123e4567-e89b-12d3-a456-426614174000

✓ Connected to WebSocket server
Socket ID: abc123

========================================
  Running Test Sequence
========================================

1. Joining session...

📡 Event: session-joined
{
  "event": "session-joined",
  "success": true,
  "data": {
    "session": {...},
    "state": {
      "status": "idle",
      ...
    }
  }
}

...

✅ All WebSocket events tested successfully!
```

---

## Manual Testing (Postman/Insomnia)

Import this collection or test manually:

### Base URL
```
http://localhost:3000/api/v1
```

### Headers (for all requests)
```
Authorization: Bearer <your-jwt-token>
Content-Type: application/json
```

### Sample Requests

#### 1. Create Live Session
```http
POST /workouts/live/sessions
Content-Type: application/json

{
  "title": "Morning Workout",
  "description": "Upper body strength",
  "private": false
}
```

#### 2. Start Exercise
```http
POST /workouts/live/sessions/:sessionId/start-exercise
Content-Type: application/json

{
  "exerciseId": "exercise-uuid-here",
  "exerciseIndex": 0
}
```

#### 3. Get Session State
```http
GET /workouts/live/sessions/:sessionId/state
```

#### 4. Complete Set
```http
POST /workouts/live/sessions/:sessionId/complete-set
Content-Type: application/json

{
  "restDurationMs": 90000
}
```

#### 5. End Session
```http
POST /workouts/live/sessions/:sessionId/end
```

---

## Troubleshooting

### Issue: "JWT_TOKEN not set"
```bash
# Check if set
echo $JWT_TOKEN

# Set it
export JWT_TOKEN="your-token"
```

### Issue: "Connection refused"
```bash
# Check if server is running
curl http://localhost:3000/auth/health

# Start server if needed
npm run start:dev
```

### Issue: "Redis connection failed"
```bash
# Check Redis
redis-cli ping  # Should return PONG

# Start Redis if needed (macOS)
brew services start redis

# Start Redis (Ubuntu)
sudo systemctl start redis
```

### Issue: "Database error"
```bash
# Check PostgreSQL
psql -U postgres -d fittalk -c "SELECT 1"

# Run migrations
npx prisma migrate dev

# Check connection
npx prisma studio  # Opens GUI
```

### Issue: "Session not found"
```bash
# Check Redis TTL (sessions expire after 4 hours)
redis-cli KEYS "session:state:*"

# Create new session if needed
curl -X POST http://localhost:3000/api/v1/workouts/live/sessions \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Session"}'
```

### Issue: "Invalid state transition"
```bash
# Check current state first
curl http://localhost:3000/api/v1/workouts/live/sessions/:id/state \
  -H "Authorization: Bearer $JWT_TOKEN"

# Valid transitions:
# idle → exercising
# exercising → resting, paused, completed
# resting → exercising, paused, completed
# paused → exercising, resting, completed
# completed → (no transitions - terminal state)
```

---

## Validation Checklist

Before pushing to repository, verify:

- [ ] All HTTP endpoints return 200/201/204 (not 500 errors)
- [ ] WebSocket connection succeeds with valid JWT
- [ ] State machine transitions work correctly
- [ ] Session data persists to PostgreSQL
- [ ] Session state persists to Redis
- [ ] Heartbeat extends Redis TTL
- [ ] Ended sessions have `endedAt` timestamp
- [ ] Unauthorized requests return 401
- [ ] Invalid state transitions return 400
- [ ] Session not found returns 404
- [ ] Redis keys have TTL set (4 hours)
- [ ] No memory leaks in Redis (check `KEYS session:*`)

---

## Performance Testing (Optional)

Test under load:

```bash
# Install artillery
npm install -g artillery

# Create artillery config (artillery.yml)
cat > artillery.yml <<EOF
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 5
  defaults:
    headers:
      Authorization: 'Bearer ${JWT_TOKEN}'
scenarios:
  - name: 'Create and end session'
    flow:
      - post:
          url: '/api/v1/workouts/live/sessions'
          json:
            title: 'Load Test'
      - post:
          url: '/api/v1/workouts/live/sessions/{{ id }}/end'
EOF

# Run load test
artillery run artillery.yml
```

---

## Next Steps

1. ✅ Run `./test/test-workouts.sh` - Verify all HTTP endpoints
2. ✅ Run WebSocket test - Verify real-time events
3. ✅ Check Redis - Verify state persistence
4. ✅ Check PostgreSQL - Verify session records
5. ✅ Review logs - Check for errors/warnings
6. ✅ Test edge cases - Invalid inputs, expired sessions
7. ✅ Clean up test data - Remove test sessions/schedules

---

## Success Criteria

Your implementation is ready to push when:

✅ All tests pass without errors
✅ No TypeScript compilation errors
✅ No linting errors
✅ State machine transitions correctly
✅ WebSocket events broadcast properly
✅ Data persists to both PostgreSQL and Redis
✅ Authentication works correctly
✅ Error handling returns appropriate status codes
✅ No memory leaks or orphaned sessions
✅ Documentation is complete

---

## Contact

If you encounter issues:
1. Check server logs: `npm run start:dev` (watch output)
2. Check Redis: `redis-cli MONITOR` (watch commands)
3. Check PostgreSQL: `npx prisma studio` (inspect data)
4. Review implementation files for comments/documentation
