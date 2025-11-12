#!/bin/bash
# cleanup.sh
# Removes all test data including HARD DELETE of cancelled workouts

set -e  # Exit on error

BASE="http://localhost:3000/api/v1"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check prerequisites
if [ -z "$JWT_TOKEN" ]; then
  echo -e "${RED}❌ Error: JWT_TOKEN environment variable not set${NC}"
  echo -e "${YELLOW}Set it with: export JWT_TOKEN=\"your-jwt-token-here\"${NC}"
  exit 1
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  CLEANUP TEST DATA (ENHANCED)${NC}"
echo -e "${BLUE}========================================${NC}\n"

# =============================================================================
# 1. DELETE ALL SCHEDULED WORKOUTS (INCLUDING CANCELLED)
# =============================================================================

echo -e "${YELLOW}1. Deleting ALL scheduled workouts (including cancelled)...${NC}"

# Get current Monday (week start)
if date -v-1d > /dev/null 2>&1; then
  # macOS/BSD date
  CURRENT_DOW=$(date -u +%u)
  DAYS_BACK=$((CURRENT_DOW - 1))
  CURRENT_MONDAY=$(date -u -v-${DAYS_BACK}d +%Y-%m-%d)
else
  # GNU date (Linux)
  CURRENT_MONDAY=$(date -u +%Y-%m-%d -d "$(date -u +%Y-%m-%d) - $(date -u +%u) days + 1 day")
fi

echo -e "${CYAN}   Current week start: $CURRENT_MONDAY${NC}"
echo -e "${CYAN}   Querying 12 weeks (6 past + current + 5 future)...${NC}"

DELETED_WORKOUTS=0
FAILED_DELETES=0

# Query MORE weeks to catch old test data (12 weeks total)
for WEEK_OFFSET in -6 -5 -4 -3 -2 -1 0 1 2 3 4 5; do
  # Calculate week start date (cross-platform)
  if date -v-1d > /dev/null 2>&1; then
    # macOS/BSD
    DAYS_OFFSET=$((WEEK_OFFSET * 7))
    if [ $DAYS_OFFSET -lt 0 ]; then
      WEEK_START=$(date -u -v${DAYS_OFFSET}d -j -f "%Y-%m-%d" "$CURRENT_MONDAY" +%Y-%m-%d 2>/dev/null || echo "")
    else
      WEEK_START=$(date -u -v+${DAYS_OFFSET}d -j -f "%Y-%m-%d" "$CURRENT_MONDAY" +%Y-%m-%d 2>/dev/null || echo "")
    fi
  else
    # GNU date (Linux)
    WEEK_START=$(date -u +%Y-%m-%d -d "$CURRENT_MONDAY + $((WEEK_OFFSET * 7)) days" 2>/dev/null || echo "")
  fi
  
  if [ -z "$WEEK_START" ]; then
    continue
  fi
  
  # Get ALL workouts for this week (no status filter - get everything!)
  WEEK_WORKOUTS=$(curl -s -X GET "$BASE/workouts/schedule/week?weekStart=$WEEK_START" \
    -H "Authorization: Bearer $JWT_TOKEN" 2>/dev/null || echo "[]")
  
  # Extract IDs from response
  WORKOUT_IDS=$(echo "$WEEK_WORKOUTS" | jq -r '.[]?.id // empty' 2>/dev/null || echo "")
  
  # Delete each workout (this actually DELETES, not just cancels)
  for WORKOUT_ID in $WORKOUT_IDS; do
    if [ -n "$WORKOUT_ID" ] && [ "$WORKOUT_ID" != "null" ]; then
      HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/workouts/schedule/$WORKOUT_ID" \
        -H "Authorization: Bearer $JWT_TOKEN" 2>/dev/null || echo "000")
      
      if [ "$HTTP_STATUS" == "204" ] || [ "$HTTP_STATUS" == "200" ]; then
        ((DELETED_WORKOUTS++))
      else
        ((FAILED_DELETES++))
      fi
    fi
  done
done

if [ "$DELETED_WORKOUTS" -gt 0 ]; then
  echo -e "${GREEN}✓ Deleted $DELETED_WORKOUTS scheduled workouts${NC}"
  if [ "$FAILED_DELETES" -gt 0 ]; then
    echo -e "${YELLOW}⚠ Failed to delete $FAILED_DELETES workouts${NC}"
  fi
  echo ""
else
  echo -e "${CYAN}ℹ No scheduled workouts found${NC}\n"
fi

# =============================================================================
# 2. CLEAR AVAILABILITY WINDOWS
# =============================================================================

echo -e "${YELLOW}2. Clearing availability windows...${NC}"

CLEAR_RESPONSE=$(curl -s -X POST "$BASE/availability" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"windows": []}' 2>/dev/null || echo "[]")

if echo "$CLEAR_RESPONSE" | jq -e '. | length == 0' > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Cleared all availability windows${NC}\n"
else
  echo -e "${YELLOW}⚠ Availability response: $(echo "$CLEAR_RESPONSE" | jq -c)${NC}\n"
fi

# =============================================================================
# 3. DELETE TEST PROGRAMS (OPTIONAL)
# =============================================================================

echo -e "${YELLOW}3. Delete test programs? (y/N): ${NC}"
read -t 10 -n 1 DELETE_PROGRAMS || DELETE_PROGRAMS="n"
echo ""

if [[ "$DELETE_PROGRAMS" =~ ^[Yy]$ ]]; then
  echo -e "${YELLOW}Fetching all programs...${NC}"
  
  ALL_PROGRAMS=$(curl -s -X GET "$BASE/programs" \
    -H "Authorization: Bearer $JWT_TOKEN" 2>/dev/null || echo "[]")
  
  PROGRAM_IDS=$(echo "$ALL_PROGRAMS" | jq -r '.[].id // empty' 2>/dev/null || echo "")
  DELETED_PROGRAMS=0
  
  if [ -n "$PROGRAM_IDS" ]; then
    for PROGRAM_ID in $PROGRAM_IDS; do
      if [ -n "$PROGRAM_ID" ] && [ "$PROGRAM_ID" != "null" ]; then
        PROGRAM_TITLE=$(echo "$ALL_PROGRAMS" | jq -r ".[] | select(.id == \"$PROGRAM_ID\") | .title")
        
        echo -e "   ${CYAN}Deleting: $PROGRAM_TITLE ($PROGRAM_ID)${NC}"
        
        HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/programs/$PROGRAM_ID" \
          -H "Authorization: Bearer $JWT_TOKEN" 2>/dev/null || echo "000")
        
        if [ "$HTTP_STATUS" == "204" ] || [ "$HTTP_STATUS" == "200" ]; then
          ((DELETED_PROGRAMS++))
        fi
      fi
    done
    echo -e "${GREEN}✓ Deleted $DELETED_PROGRAMS programs${NC}\n"
  else
    echo -e "${CYAN}ℹ No programs found${NC}\n"
  fi
else
  echo -e "${CYAN}ℹ Skipped program deletion${NC}\n"
fi

# =============================================================================
# 4. VERIFICATION - CHECK FOR REMAINING CANCELLED WORKOUTS
# =============================================================================

echo -e "${YELLOW}4. Verifying cleanup...${NC}"

# Check a few weeks for any remaining cancelled workouts
REMAINING_CANCELLED=0

for WEEK_OFFSET in -2 -1 0 1 2; do
  if date -v-1d > /dev/null 2>&1; then
    DAYS_OFFSET=$((WEEK_OFFSET * 7))
    if [ $DAYS_OFFSET -lt 0 ]; then
      WEEK_START=$(date -u -v${DAYS_OFFSET}d -j -f "%Y-%m-%d" "$CURRENT_MONDAY" +%Y-%m-%d 2>/dev/null || echo "")
    else
      WEEK_START=$(date -u -v+${DAYS_OFFSET}d -j -f "%Y-%m-%d" "$CURRENT_MONDAY" +%Y-%m-%d 2>/dev/null || echo "")
    fi
  else
    WEEK_START=$(date -u +%Y-%m-%d -d "$CURRENT_MONDAY + $((WEEK_OFFSET * 7)) days" 2>/dev/null || echo "")
  fi
  
  if [ -z "$WEEK_START" ]; then
    continue
  fi
  
  WEEK_CHECK=$(curl -s -X GET "$BASE/workouts/schedule/week?weekStart=$WEEK_START" \
    -H "Authorization: Bearer $JWT_TOKEN" 2>/dev/null || echo "[]")
  
  CANCELLED_COUNT=$(echo "$WEEK_CHECK" | jq '[.[] | select(.status == "cancelled")] | length' 2>/dev/null || echo "0")
  REMAINING_CANCELLED=$((REMAINING_CANCELLED + CANCELLED_COUNT))
done

if [ "$REMAINING_CANCELLED" -gt 0 ]; then
  echo -e "${YELLOW}⚠ Found $REMAINING_CANCELLED cancelled workouts still in database${NC}"
  echo -e "${YELLOW}   Run 'pnpm prisma studio' to manually delete them${NC}\n"
else
  echo -e "${GREEN}✓ No cancelled workouts remaining${NC}\n"
fi

# =============================================================================
# SUMMARY
# =============================================================================

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  CLEANUP SUMMARY${NC}"
echo -e "${BLUE}========================================${NC}\n"

echo -e "${GREEN}✓ Scheduled Workouts: $DELETED_WORKOUTS deleted${NC}"
if [ "$FAILED_DELETES" -gt 0 ]; then
  echo -e "${RED}✗ Failed Deletes: $FAILED_DELETES${NC}"
fi
echo -e "${GREEN}✓ Availability Windows: Cleared${NC}"

if [[ "$DELETE_PROGRAMS" =~ ^[Yy]$ ]]; then
  echo -e "${GREEN}✓ Programs: $DELETED_PROGRAMS deleted${NC}"
else
  echo -e "${YELLOW}⚠ Programs: Not deleted${NC}"
fi

if [ "$REMAINING_CANCELLED" -gt 0 ]; then
  echo -e "${YELLOW}⚠ Cancelled workouts: $REMAINING_CANCELLED remaining (manual cleanup needed)${NC}"
else
  echo -e "${GREEN}✓ Cancelled workouts: All cleared${NC}"
fi

echo ""
echo -e "${CYAN}Database is clean and ready for testing!${NC}"