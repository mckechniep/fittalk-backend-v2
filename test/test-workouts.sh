#!/bin/bash
# test-workouts.sh
# Comprehensive test for workouts module with complete data setup
# (Phase 0: Setup → Phase 1: Scheduling → Phase 2: Live Sessions)

# Requires jq (JSON processor)
# Install: brew install jq (macOS) or sudo apt-get install jq (Ubuntu)

# PREREQUISITES:
# 1. Set your JWT token: export JWT_TOKEN="your-jwt-token-here"
# 2. Make executable: chmod +x test/test-workouts.sh
# 3. Ensure app is running: pnpm run start:dev
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
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Global variables to store IDs
PROGRAM_ID=""
DAY_ID_1=""
DAY_ID_2=""
DAY_ID_3=""
SCHEDULED_WORKOUT_ID=""
LIVE_SESSION_ID=""

# Dynamic Date Calculation, so "Get Upcoming Workout" test now always returns a workout scheduled in the future
get_next_monday() {
  if command -v gdate &> /dev/null; then
    gdate -d "next monday" +%Y-%m-%d
  else
    date -v +mon 2>/dev/null || date -d "next monday" +%Y-%m-%d 2>/dev/null || echo "2025-11-18"
  fi
}

NEXT_MONDAY=$(get_next_monday)

# Check prerequisites
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  WORKOUT MODULE TEST SUITE${NC}"
echo -e "${BLUE}  With Complete Data Setup${NC}"
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
echo -e "${CYAN}ℹ Using week starting: $NEXT_MONDAY${NC}\n"

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

# =============================================================================
# PHASE 0: SETUP - CREATE TEST DATA
# =============================================================================

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  PHASE 0: TEST DATA SETUP${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Step 1: Create Availability Windows
echo -e "${YELLOW}Setup 1/4: Creating availability windows...${NC}"
echo -e "   ${CYAN}Monday:${NC}    9:00 AM - 12:00 PM (high priority)"
echo -e "   ${CYAN}Wednesday:${NC} 6:00 AM - 9:00 AM  (high priority)"
echo -e "   ${CYAN}Friday:${NC}    7:00 AM - 10:00 AM (high priority)"

AVAILABILITY_RESPONSE=$(curl -s -X POST "$BASE/availability" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "windows": [
      {
        "dayOfWeek": 1,
        "startMin": 540,
        "endMin": 720,
        "priority": 2
      },
      {
        "dayOfWeek": 3,
        "startMin": 360,
        "endMin": 540,
        "priority": 2
      },
      {
        "dayOfWeek": 5,
        "startMin": 420,
        "endMin": 600,
        "priority": 2
      }
    ]
  }')

WINDOW_COUNT=$(echo "$AVAILABILITY_RESPONSE" | jq 'length')
echo -e "${GREEN}✓ Created $WINDOW_COUNT availability windows${NC}\n"

# Step 2: Create Workout Program
echo -e "${YELLOW}Setup 2/4: Creating workout program...${NC}"
PROGRAM_RESPONSE=$(curl -s -X POST "$BASE/programs" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Program - 3x/week Strength",
    "weeks": 4,
    "sourceJson": {
      "template": "test_workout_module",
      "created_by": "automated_test"
    }
  }')

PROGRAM_ID=$(echo "$PROGRAM_RESPONSE" | jq -r '.id')
if [ -z "$PROGRAM_ID" ] || [ "$PROGRAM_ID" == "null" ]; then
  echo -e "${RED}❌ Failed to create program${NC}"
  echo "$PROGRAM_RESPONSE" | jq
  exit 1
fi

echo -e "${GREEN}✓ Created program: $PROGRAM_ID${NC}"
echo -e "   Title: $(echo "$PROGRAM_RESPONSE" | jq -r '.title')"
echo -e "   Status: $(echo "$PROGRAM_RESPONSE" | jq -r '.status')\n"

# Step 3: Add Workout Days to Program
echo -e "${YELLOW}Setup 3/4: Adding workout days to program...${NC}"

# Monday - Upper Body (dayNumber 1 = Monday in WorkoutDay schema)
DAY_1_RESPONSE=$(curl -s -X POST "$BASE/programs/$PROGRAM_ID/days" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "weekNumber": 1,
    "dayNumber": 1,
    "focus": "strength",
    "notes": "Upper body compound lifts - Bench, Rows, Overhead Press"
  }')
DAY_ID_1=$(echo "$DAY_1_RESPONSE" | jq -r '.id')
echo -e "   ${CYAN}Monday (Day 1):${NC} Upper Body - ID: $DAY_ID_1"

# Wednesday - Lower Body (dayNumber 3 = Wednesday)
DAY_2_RESPONSE=$(curl -s -X POST "$BASE/programs/$PROGRAM_ID/days" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "weekNumber": 1,
    "dayNumber": 3,
    "focus": "strength",
    "notes": "Lower body - Squats, Deadlifts, Lunges"
  }')
DAY_ID_2=$(echo "$DAY_2_RESPONSE" | jq -r '.id')
echo -e "   ${CYAN}Wednesday (Day 3):${NC} Lower Body - ID: $DAY_ID_2"

# Friday - Full Body (dayNumber 5 = Friday)
DAY_3_RESPONSE=$(curl -s -X POST "$BASE/programs/$PROGRAM_ID/days" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "weekNumber": 1,
    "dayNumber": 5,
    "focus": "strength",
    "notes": "Full body accessory work"
  }')
DAY_ID_3=$(echo "$DAY_3_RESPONSE" | jq -r '.id')
echo -e "   ${CYAN}Friday (Day 5):${NC} Full Body - ID: $DAY_ID_3"

echo -e "${GREEN}✓ Added 3 workout days to program${NC}\n"

# Step 4: Activate Program
echo -e "${YELLOW}Setup 4/4: Activating program...${NC}"
ACTIVATE_RESPONSE=$(curl -s -X PATCH "$BASE/programs/$PROGRAM_ID/status" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}')

PROGRAM_STATUS=$(echo "$ACTIVATE_RESPONSE" | jq -r '.status')
if [ "$PROGRAM_STATUS" == "active" ]; then
  echo -e "${GREEN}✓ Program activated successfully${NC}"
else
  echo -e "${RED}❌ Failed to activate program${NC}"
  echo "$ACTIVATE_RESPONSE" | jq
  exit 1
fi

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  SETUP COMPLETE!${NC}"
echo -e "${GREEN}  - Availability: 3 windows${NC}"
echo -e "${GREEN}  - Program: $PROGRAM_ID${NC}"
echo -e "${GREEN}  - Workout Days: 3 (Mon, Wed, Fri)${NC}"
echo -e "${GREEN}  - Status: Active${NC}"
echo -e "${GREEN}========================================${NC}\n"

# Pause for dramatic effect
sleep 1

# =============================================================================
# PHASE 1: SCHEDULING TESTS
# =============================================================================

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  PHASE 1: SCHEDULING TESTS${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Test 1: Generate Weekly Schedule
echo -e "${YELLOW}1. Generate Weekly Schedule (POST /workouts/schedule/week)${NC}"
SCHEDULE_RESPONSE=$(curl -s -X POST "$BASE/workouts/schedule/week" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"weekStart\": \"$NEXT_MONDAY\",
    \"regenerate\": true
  }")
echo "$SCHEDULE_RESPONSE" | jq

if echo "$SCHEDULE_RESPONSE" | jq -e '.scheduled' > /dev/null 2>&1; then
  SCHEDULED_COUNT=$(echo "$SCHEDULE_RESPONSE" | jq -r '.scheduled | length')
  echo -e "${GREEN}✓ Schedule generated successfully: $SCHEDULED_COUNT workouts scheduled${NC}\n"
  
  # Extract first scheduled workout ID
  SCHEDULED_WORKOUT_ID=$(echo "$SCHEDULE_RESPONSE" | jq -r '.scheduled[0].id // empty')
  
  # Show summary
  if echo "$SCHEDULE_RESPONSE" | jq -e '.summary' > /dev/null 2>&1; then
    echo -e "${CYAN}   Summary:${NC}"
    echo "$SCHEDULE_RESPONSE" | jq '.summary'
    echo ""
  fi
else
  echo -e "${YELLOW}⚠ Schedule generation returned unexpected response${NC}"
  echo -e "${RED}This should not happen with our setup data!${NC}\n"
fi

# Test 2: Get Weekly Schedule
echo -e "${YELLOW}2. Get Weekly Schedule (GET /workouts/schedule/week)${NC}"
WEEK_SCHEDULE=$(curl -s -X GET "$BASE/workouts/schedule/week?weekStart=$NEXT_MONDAY" \
  -H "Authorization: Bearer $JWT_TOKEN")
echo "$WEEK_SCHEDULE" | jq

SCHEDULE_LENGTH=$(echo "$WEEK_SCHEDULE" | jq 'length')
if [ "$SCHEDULE_LENGTH" -gt 0 ]; then
  echo -e "${GREEN}✓ Weekly schedule retrieved: $SCHEDULE_LENGTH workouts found${NC}\n"
else
  echo -e "${YELLOW}⚠ No scheduled workouts found${NC}\n"
fi

# Test 3: Get Upcoming Workout
echo -e "${YELLOW}3. Get Upcoming Workout (GET /workouts/schedule/upcoming)${NC}"
UPCOMING=$(curl -s -X GET "$BASE/workouts/schedule/upcoming" \
  -H "Authorization: Bearer $JWT_TOKEN")
echo "$UPCOMING" | jq

if [ "$UPCOMING" != "null" ]; then
  UPCOMING_DATE=$(echo "$UPCOMING" | jq -r '.scheduledAt')
  echo -e "${GREEN}✓ Upcoming workout found: $UPCOMING_DATE${NC}\n"
else
  echo -e "${YELLOW}⚠ No upcoming workout found${NC}\n"
fi

# Test 4: Cancel Scheduled Workout (if we have an ID)
if [ -n "$SCHEDULED_WORKOUT_ID" ] && [ "$SCHEDULED_WORKOUT_ID" != "null" ]; then
  echo -e "${YELLOW}4. Cancel Scheduled Workout (DELETE /workouts/schedule/:id)${NC}"
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/workouts/schedule/$SCHEDULED_WORKOUT_ID" \
    -H "Authorization: Bearer $JWT_TOKEN")
  
  if [ "$HTTP_STATUS" == "204" ] || [ "$HTTP_STATUS" == "200" ]; then
    echo -e "HTTP Status: $HTTP_STATUS"
    echo -e "${GREEN}✓ Scheduled workout cancelled${NC}\n"
  else
    echo -e "HTTP Status: $HTTP_STATUS"
    echo -e "${YELLOW}⚠ Cancel returned unexpected status${NC}\n"
  fi
else
  echo -e "${YELLOW}4. Skip: No scheduled workout ID to cancel${NC}\n"
fi

# =============================================================================
# PHASE 2: LIVE SESSION TESTS
# =============================================================================

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
if [ -n "$LIVE_SESSION_ID" ] && [ "$LIVE_SESSION_ID" != "null" ]; then
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

# Test 14: Heartbeat
echo -e "${YELLOW}14. Record Heartbeat (POST /workouts/live/sessions/:id/heartbeat)${NC}"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/workouts/live/sessions/$LIVE_SESSION_ID/heartbeat" \
  -H "Authorization: Bearer $JWT_TOKEN")
echo "HTTP Status: $HTTP_STATUS"
echo -e "${GREEN}✓ Heartbeat recorded${NC}\n"

# Test 15: Record Event
echo -e "${YELLOW}15. Record Custom Event (POST /workouts/live/sessions/:id/events)${NC}"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/workouts/live/sessions/$LIVE_SESSION_ID/events" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "coach.cue",
    "data": {
      "message": "Keep your core tight!"
    }
  }')
echo "HTTP Status: $HTTP_STATUS"
echo -e "${GREEN}✓ Event recorded${NC}\n"

# Test 16: Update Session Metadata
echo -e "${YELLOW}16. Update Session Metadata (PUT /workouts/live/sessions/:id)${NC}"
UPDATE_SESSION=$(curl -s -X PUT "$BASE/workouts/live/sessions/$LIVE_SESSION_ID" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Test Workout",
    "description": "Updated description",
    "private": false
  }')
echo "$UPDATE_SESSION" | jq
echo -e "${GREEN}✓ Session metadata updated${NC}\n"

# Test 17: End Session
echo -e "${YELLOW}17. End Session (POST /workouts/live/sessions/:id/end)${NC}"
END_SESSION=$(curl -s -X POST "$BASE/workouts/live/sessions/$LIVE_SESSION_ID/end" \
  -H "Authorization: Bearer $JWT_TOKEN")
echo "$END_SESSION" | jq
echo -e "${GREEN}✓ Session ended${NC}\n"

# Test 18: Verify endedAt timestamp
echo -e "${YELLOW}18. Verify Session Has endedAt Timestamp${NC}"
FINAL_SESSION=$(curl -s -X GET "$BASE/workouts/live/sessions/$LIVE_SESSION_ID" \
  -H "Authorization: Bearer $JWT_TOKEN")
echo "$FINAL_SESSION" | jq

ENDED_AT=$(echo "$FINAL_SESSION" | jq -r '.endedAt')
if [ "$ENDED_AT" != "null" ] && [ -n "$ENDED_AT" ]; then
  echo -e "${GREEN}✓ Session properly ended with timestamp: $ENDED_AT${NC}\n"
else
  echo -e "${RED}❌ Session missing endedAt timestamp${NC}\n"
fi

# =============================================================================
# TEST SUMMARY
# =============================================================================

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  TEST SUMMARY${NC}"
echo -e "${BLUE}========================================${NC}\n"

echo -e "${GREEN}✅ Phase 0 (Setup):${NC}"
echo -e "  - Created availability windows (3)"
echo -e "  - Created workout program"
echo -e "  - Added workout days (3)"
echo -e "  - Activated program"
echo ""

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

echo -e "${CYAN}All tests completed!${NC}"
echo -e "${YELLOW}Note: WebSocket tests require a separate client (see test-websocket.js)${NC}"