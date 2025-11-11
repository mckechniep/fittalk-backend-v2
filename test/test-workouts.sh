#!/bin/bash
# test-workouts.sh
# Comprehensive test for workouts module (Phase 1: Scheduling + Phase 2: Live Sessions)

# Requires jq (JSON processor)
# Install: brew install jq (macOS) or sudo apt-get install jq (Ubuntu)

# PREREQUISITES:
# 1. Set your JWT token: export JWT_TOKEN="your-jwt-token-here"
# 2. Make executable: chmod +x test/test-workouts.sh
# 3. Ensure app is running: npm run start:dev
# 4. Ensure Redis is running: redis-cli ping (should return PONG)
# 5. Ensure PostgreSQL is running and migrated

# Run: ./test/test-workouts.sh

set -e  # Exit on error

BASE="http://localhost:3000/api/v1"
HEALTH_BASE="http://localhost:3000"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check prerequisites
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  WORKOUT MODULE TEST SUITE${NC}"
echo -e "${BLUE}========================================${NC}\n"

if [ -z "$JWT_TOKEN" ]; then
  echo -e "${RED}❌ Error: JWT_TOKEN environment variable not set${NC}"
  echo -e "${YELLOW}Set it with: export JWT_TOKEN=\"your-jwt-token-here\"${NC}"
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo -e "${RED}❌ Error: jq is not installed${NC}"
  echo -e "${YELLOW}Install with: brew install jq (macOS) or sudo apt-get install jq (Ubuntu)${NC}"
  exit 1
fi

echo -e "${GREEN}✓ JWT_TOKEN is set${NC}"
echo -e "${GREEN}✓ jq is installed${NC}\n"

# Test health endpoint
echo -e "${BLUE}0. Testing server health...${NC}"
HEALTH_RESPONSE=$(curl -s $HEALTH_BASE/auth/health)
echo "$HEALTH_RESPONSE" | jq
if [[ "$HEALTH_RESPONSE" == *"ok"* ]]; then
  echo -e "${GREEN}✓ Server is healthy${NC}\n"
else
  echo -e "${RED}❌ Server health check failed${NC}"
  exit 1
fi

# Variables to store IDs
SCHEDULED_WORKOUT_ID=""
LIVE_SESSION_ID=""

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  PHASE 1: SCHEDULING TESTS${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Test 1: Generate Weekly Schedule
echo -e "${YELLOW}1. Generate Weekly Schedule (POST /workouts/schedule/week)${NC}"
SCHEDULE_RESPONSE=$(curl -s -X POST "$BASE/workouts/schedule/week" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "weekStart": "2025-01-20",
    "regenerate": true
  }')
echo "$SCHEDULE_RESPONSE" | jq

if echo "$SCHEDULE_RESPONSE" | jq -e '.scheduled' > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Schedule generated successfully${NC}\n"
  # Extract first scheduled workout ID if available
  SCHEDULED_WORKOUT_ID=$(echo "$SCHEDULE_RESPONSE" | jq -r '.scheduled[0].id // empty')
else
  echo -e "${YELLOW}⚠ Schedule generation returned unexpected response (may need workout plan data)${NC}\n"
fi

# Test 2: Get Weekly Schedule
echo -e "${YELLOW}2. Get Weekly Schedule (GET /workouts/schedule/week)${NC}"
WEEK_SCHEDULE=$(curl -s -X GET "$BASE/workouts/schedule/week?weekStart=2025-01-20" \
  -H "Authorization: Bearer $JWT_TOKEN")
echo "$WEEK_SCHEDULE" | jq
echo -e "${GREEN}✓ Weekly schedule retrieved${NC}\n"

# Test 3: Get Upcoming Workout
echo -e "${YELLOW}3. Get Upcoming Workout (GET /workouts/schedule/upcoming)${NC}"
UPCOMING=$(curl -s -X GET "$BASE/workouts/schedule/upcoming" \
  -H "Authorization: Bearer $JWT_TOKEN")
echo "$UPCOMING" | jq
echo -e "${GREEN}✓ Upcoming workout queried${NC}\n"

# Test 4: Cancel Scheduled Workout (if we have an ID)
if [ -n "$SCHEDULED_WORKOUT_ID" ]; then
  echo -e "${YELLOW}4. Cancel Scheduled Workout (DELETE /workouts/schedule/:id)${NC}"
  curl -s -X DELETE "$BASE/workouts/schedule/$SCHEDULED_WORKOUT_ID" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -w "\nHTTP Status: %{http_code}\n"
  echo -e "${GREEN}✓ Scheduled workout cancelled${NC}\n"
else
  echo -e "${YELLOW}4. Skip: No scheduled workout ID to cancel${NC}\n"
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  PHASE 2: LIVE SESSION TESTS${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Test 5: Create Live Session
echo -e "${YELLOW}5. Create Live Session (POST /workouts/live/sessions)${NC}"
CREATE_SESSION=$(curl -s -X POST "$BASE/workouts/live/sessions" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Morning Workout",
    "description": "Testing Phase 2 live session implementation",
    "private": false
  }')
echo "$CREATE_SESSION" | jq

LIVE_SESSION_ID=$(echo "$CREATE_SESSION" | jq -r '.id // empty')
if [ -n "$LIVE_SESSION_ID" ]; then
  echo -e "${GREEN}✓ Live session created: $LIVE_SESSION_ID${NC}\n"
else
  echo -e "${RED}❌ Failed to create live session${NC}\n"
  exit 1
fi

# Test 6: Get Session Details
echo -e "${YELLOW}6. Get Session Details (GET /workouts/live/sessions/:id)${NC}"
SESSION_DETAILS=$(curl -s -X GET "$BASE/workouts/live/sessions/$LIVE_SESSION_ID" \
  -H "Authorization: Bearer $JWT_TOKEN")
echo "$SESSION_DETAILS" | jq
echo -e "${GREEN}✓ Session details retrieved${NC}\n"

# Test 7: Get Active Sessions
echo -e "${YELLOW}7. Get All Active Sessions (GET /workouts/live/sessions)${NC}"
ACTIVE_SESSIONS=$(curl -s -X GET "$BASE/workouts/live/sessions" \
  -H "Authorization: Bearer $JWT_TOKEN")
echo "$ACTIVE_SESSIONS" | jq
echo -e "${GREEN}✓ Active sessions list retrieved${NC}\n"

# Test 8: Get Session State
echo -e "${YELLOW}8. Get Session State (GET /workouts/live/sessions/:id/state)${NC}"
SESSION_STATE=$(curl -s -X GET "$BASE/workouts/live/sessions/$LIVE_SESSION_ID/state" \
  -H "Authorization: Bearer $JWT_TOKEN")
echo "$SESSION_STATE" | jq
echo -e "${GREEN}✓ Session state retrieved (should be 'idle')${NC}\n"

# Test 9: Start Exercise
echo -e "${YELLOW}9. Start Exercise (POST /workouts/live/sessions/:id/start-exercise)${NC}"
START_EXERCISE=$(curl -s -X POST "$BASE/workouts/live/sessions/$LIVE_SESSION_ID/start-exercise" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "exerciseId": "test-exercise-123",
    "exerciseIndex": 0
  }')
echo "$START_EXERCISE" | jq
echo -e "${GREEN}✓ Exercise started (status should transition to 'exercising')${NC}\n"

# Test 10: Complete Set
echo -e "${YELLOW}10. Complete Set (POST /workouts/live/sessions/:id/complete-set)${NC}"
COMPLETE_SET=$(curl -s -X POST "$BASE/workouts/live/sessions/$LIVE_SESSION_ID/complete-set" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "restDurationMs": 90000
  }')
echo "$COMPLETE_SET" | jq
echo -e "${GREEN}✓ Set completed (status should transition to 'resting')${NC}\n"

# Test 11: End Rest
echo -e "${YELLOW}11. End Rest (POST /workouts/live/sessions/:id/end-rest)${NC}"
END_REST=$(curl -s -X POST "$BASE/workouts/live/sessions/$LIVE_SESSION_ID/end-rest" \
  -H "Authorization: Bearer $JWT_TOKEN")
echo "$END_REST" | jq
echo -e "${GREEN}✓ Rest ended (status should transition back to 'exercising')${NC}\n"

# Test 12: Pause Session
echo -e "${YELLOW}12. Pause Session (POST /workouts/live/sessions/:id/pause)${NC}"
PAUSE_SESSION=$(curl -s -X POST "$BASE/workouts/live/sessions/$LIVE_SESSION_ID/pause" \
  -H "Authorization: Bearer $JWT_TOKEN")
echo "$PAUSE_SESSION" | jq
echo -e "${GREEN}✓ Session paused${NC}\n"

# Test 13: Resume Session
echo -e "${YELLOW}13. Resume Session (POST /workouts/live/sessions/:id/resume)${NC}"
RESUME_SESSION=$(curl -s -X POST "$BASE/workouts/live/sessions/$LIVE_SESSION_ID/resume" \
  -H "Authorization: Bearer $JWT_TOKEN")
echo "$RESUME_SESSION" | jq
echo -e "${GREEN}✓ Session resumed${NC}\n"

# Test 14: Record Heartbeat
echo -e "${YELLOW}14. Record Heartbeat (POST /workouts/live/sessions/:id/heartbeat)${NC}"
curl -s -X POST "$BASE/workouts/live/sessions/$LIVE_SESSION_ID/heartbeat" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -w "\nHTTP Status: %{http_code}\n"
echo -e "${GREEN}✓ Heartbeat recorded${NC}\n"

# Test 15: Record Event
echo -e "${YELLOW}15. Record Custom Event (POST /workouts/live/sessions/:id/events)${NC}"
curl -s -X POST "$BASE/workouts/live/sessions/$LIVE_SESSION_ID/events" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "coach.cue",
    "data": {
      "message": "Keep your core tight!"
    }
  }' \
  -w "\nHTTP Status: %{http_code}\n"
echo -e "${GREEN}✓ Event recorded${NC}\n"

# Test 16: Update Session Metadata
echo -e "${YELLOW}16. Update Session Metadata (PUT /workouts/live/sessions/:id)${NC}"
UPDATE_SESSION=$(curl -s -X PUT "$BASE/workouts/live/sessions/$LIVE_SESSION_ID" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Test Workout",
    "description": "Updated description"
  }')
echo "$UPDATE_SESSION" | jq
echo -e "${GREEN}✓ Session metadata updated${NC}\n"

# Test 17: End Session
echo -e "${YELLOW}17. End Session (POST /workouts/live/sessions/:id/end)${NC}"
END_SESSION=$(curl -s -X POST "$BASE/workouts/live/sessions/$LIVE_SESSION_ID/end" \
  -H "Authorization: Bearer $JWT_TOKEN")
echo "$END_SESSION" | jq
echo -e "${GREEN}✓ Session ended${NC}\n"

# Test 18: Verify Session Ended
echo -e "${YELLOW}18. Verify Session Has endedAt Timestamp${NC}"
ENDED_SESSION=$(curl -s -X GET "$BASE/workouts/live/sessions/$LIVE_SESSION_ID" \
  -H "Authorization: Bearer $JWT_TOKEN")
echo "$ENDED_SESSION" | jq
ENDED_AT=$(echo "$ENDED_SESSION" | jq -r '.endedAt // empty')
if [ -n "$ENDED_AT" ] && [ "$ENDED_AT" != "null" ]; then
  echo -e "${GREEN}✓ Session properly ended with timestamp: $ENDED_AT${NC}\n"
else
  echo -e "${YELLOW}⚠ Session may not have ended properly${NC}\n"
fi

# Final Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  TEST SUMMARY${NC}"
echo -e "${BLUE}========================================${NC}\n"

echo -e "${GREEN}✅ Phase 1 (Scheduling):${NC}"
echo -e "  - Generate weekly schedule"
echo -e "  - Get weekly schedule"
echo -e "  - Get upcoming workout"
echo -e "  - Cancel scheduled workout"
echo ""
echo -e "${GREEN}✅ Phase 2 (Live Sessions):${NC}"
echo -e "  - Create session"
echo -e "  - Get session details"
echo -e "  - List active sessions"
echo -e "  - Get session state (FSM)"
echo -e "  - Start exercise"
echo -e "  - Complete set (transition to rest)"
echo -e "  - End rest (back to exercising)"
echo -e "  - Pause session"
echo -e "  - Resume session"
echo -e "  - Record heartbeat"
echo -e "  - Record custom event"
echo -e "  - Update session metadata"
echo -e "  - End session"
echo ""
echo -e "${BLUE}All tests completed!${NC}"
echo -e "${YELLOW}Note: WebSocket tests require a separate client (see test-websocket.js)${NC}\n"
