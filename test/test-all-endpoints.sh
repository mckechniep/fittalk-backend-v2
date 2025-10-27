#!/bin/bash
# test-all-endpoints.sh

# Requires jq
# Install jq on macOS: 
# brew install jq
# Install jq on Ubuntu: 
# sudo apt-get install jq

# Make sure your JWT_TOKEN is set first
# export JWT_TOKEN="your-jwt-token-here"

# Make the script executable
# chmod +x test/test-all-endpoints.sh

# Run the script
# ./test/test-all-endpoints.sh

BASE="http://localhost:3000"

echo "========================================"
echo "FitTalk Backend API Tests"
echo "========================================"

echo -e "\n1. Health Check (Public)"
curl -s $BASE/auth/health | jq

echo -e "\n2. Get Current User"
curl -s -H "Authorization: Bearer $JWT_TOKEN" $BASE/api/v1/auth/me | jq

echo -e "\n3. Create/Update Profile"
curl -s -X POST $BASE/api/v1/auth/profile \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"firstname":"Jane","lastname":"Smith","sex":"female","heightCm":165,"weightKg":60}' | jq

echo -e "\n4. Get Sessions"
curl -s -H "Authorization: Bearer $JWT_TOKEN" $BASE/api/v1/auth/sessions | jq

echo -e "\n========================================"
echo -e "DEVICE MANAGEMENT TESTS"
echo -e "========================================"

echo -e "\n5. Register Device"
DEVICE_RESPONSE=$(curl -s -X POST $BASE/api/v1/auth/devices \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"platform":"android","deviceId":"test-device-123","pushToken":"fcm-token-abc"}')
echo $DEVICE_RESPONSE | jq
DEVICE_ID=$(echo $DEVICE_RESPONSE | jq -r '.deviceId')
echo "Captured Device ID: $DEVICE_ID"

echo -e "\n6. List All Devices"
curl -s -H "Authorization: Bearer $JWT_TOKEN" $BASE/api/v1/auth/devices | jq

echo -e "\n7. Update Device Push Token"
curl -s -X PUT $BASE/api/v1/auth/devices/$DEVICE_ID \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pushToken":"fcm-token-updated-xyz"}' | jq

echo -e "\n8. Verify Device (Should be valid)"
curl -s -H "Authorization: Bearer $JWT_TOKEN" $BASE/api/v1/auth/devices/$DEVICE_ID/verify | jq

echo -e "\n9. Revoke Device"
curl -s -X DELETE $BASE/api/v1/auth/devices/$DEVICE_ID \
  -H "Authorization: Bearer $JWT_TOKEN" | jq

echo -e "\n10. Verify Device (Should be invalid - revoked)"
curl -s -H "Authorization: Bearer $JWT_TOKEN" $BASE/api/v1/auth/devices/$DEVICE_ID/verify | jq

echo -e "\n11. List All Devices (Should show revoked device)"
curl -s -H "Authorization: Bearer $JWT_TOKEN" $BASE/api/v1/auth/devices | jq

echo -e "\n========================================"
echo -e "Device Management Tests Complete"
echo -e "========================================"

echo -e "\n========================================"
echo -e "GOALS MODULE TESTS"
echo -e "========================================"

echo -e "\n12. Create Goal (Fat Loss)"
GOAL_RESPONSE=$(curl -s -X POST $BASE/api/v1/goals \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type":"fat_loss",
    "description":"Lose 10kg for summer",
    "targetDate":"2025-06-01",
    "startWeightKg":85.5,
    "targetWeightKg":75.5
  }')
echo $GOAL_RESPONSE | jq
GOAL_ID=$(echo $GOAL_RESPONSE | jq -r '.id')
echo "Captured Goal ID: $GOAL_ID"

echo -e "\n13. Create Goal (Muscle Gain)"
curl -s -X POST $BASE/api/v1/goals \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type":"muscle_gain",
    "description":"Build 5kg lean muscle",
    "targetDate":"2025-12-31",
    "startWeightKg":75,
    "targetWeightKg":80
  }' | jq

echo -e "\n14. List All Goals"
curl -s -H "Authorization: Bearer $JWT_TOKEN" $BASE/api/v1/goals | jq

echo -e "\n15. Get Specific Goal"
curl -s -H "Authorization: Bearer $JWT_TOKEN" $BASE/api/v1/goals/$GOAL_ID | jq

echo -e "\n16. Update Goal"
curl -s -X PATCH $BASE/api/v1/goals/$GOAL_ID \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description":"Lose 10kg for summer beach trip",
    "targetWeightKg":74.0
  }' | jq

echo -e "\n17. Update Goal Status to Paused"
curl -s -X PATCH $BASE/api/v1/goals/$GOAL_ID/status \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"paused"}' | jq

echo -e "\n18. Update Goal Status to Active"
curl -s -X PATCH $BASE/api/v1/goals/$GOAL_ID/status \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"active"}' | jq

echo -e "\n19. Filter Goals by Status (active)"
curl -s -H "Authorization: Bearer $JWT_TOKEN" "$BASE/api/v1/goals?status=active" | jq

echo -e "\n20. Update Goal Status to Achieved"
curl -s -X PATCH $BASE/api/v1/goals/$GOAL_ID/status \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"achieved"}' | jq

echo -e "\n21. Delete Goal"
curl -s -X DELETE $BASE/api/v1/goals/$GOAL_ID \
  -H "Authorization: Bearer $JWT_TOKEN"

echo -e "\n22. List All Goals (After deletion)"
curl -s -H "Authorization: Bearer $JWT_TOKEN" $BASE/api/v1/goals | jq

echo -e "\n========================================"
echo -e "All Tests Complete"
echo -e "========================================"


echo -e "\n========================================"
echo -e "PROGRAMS MODULE TESTS"
echo -e "========================================"

echo -e "\n23. Create Program"
PROGRAM_RESPONSE=$(curl -s -X POST $BASE/api/v1/programs \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title":"12-Week Strength Builder",
    "weeks":12,
    "sourceJson":{"template":"strength_beginner"}
  }')
echo $PROGRAM_RESPONSE | jq
PROGRAM_ID=$(echo $PROGRAM_RESPONSE | jq -r '.id')
echo "Captured Program ID: $PROGRAM_ID"

echo -e "\n24. List All Programs"
curl -s -H "Authorization: Bearer $JWT_TOKEN" $BASE/api/v1/programs | jq

echo -e "\n25. Get Specific Program (Empty - no days yet)"
curl -s -H "Authorization: Bearer $JWT_TOKEN" $BASE/api/v1/programs/$PROGRAM_ID | jq

echo -e "\n26. Add Workout Day (Week 1, Monday, Strength)"
DAY_RESPONSE=$(curl -s -X POST $BASE/api/v1/programs/$PROGRAM_ID/days \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "weekNumber":1,
    "dayNumber":1,
    "focus":"strength",
    "notes":"Focus on compound lifts"
  }')
echo $DAY_RESPONSE | jq
DAY_ID=$(echo $DAY_RESPONSE | jq -r '.id')
echo "Captured Day ID: $DAY_ID"

echo -e "\n27. Add Another Workout Day (Week 1, Wednesday, Hypertrophy)"
DAY2_RESPONSE=$(curl -s -X POST $BASE/api/v1/programs/$PROGRAM_ID/days \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "weekNumber":1,
    "dayNumber":3,
    "focus":"hypertrophy",
    "notes":"Volume work, 8-12 reps"
  }')
echo $DAY2_RESPONSE | jq
DAY2_ID=$(echo $DAY2_RESPONSE | jq -r '.id')
echo "Captured Day 2 ID: $DAY2_ID"

echo -e "\n28. Add Workout Day (Week 1, Friday, Strength)"
curl -s -X POST $BASE/api/v1/programs/$PROGRAM_ID/days \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "weekNumber":1,
    "dayNumber":5,
    "focus":"strength",
    "notes":"Lower body focus"
  }' | jq

echo -e "\n29. Update Workout Day"
curl -s -X PATCH $BASE/api/v1/programs/$PROGRAM_ID/days/$DAY_ID \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "notes":"Focus on compound lifts with progressive overload"
  }' | jq

echo -e "\n30. Get Program with Days"
curl -s -H "Authorization: Bearer $JWT_TOKEN" $BASE/api/v1/programs/$PROGRAM_ID | jq

echo -e "\n31. Update Program Title"
curl -s -X PATCH $BASE/api/v1/programs/$PROGRAM_ID \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"12-Week Strength Builder (Updated)"}' | jq

echo -e "\n32. Update Program Status to Active"
curl -s -X PATCH $BASE/api/v1/programs/$PROGRAM_ID/status \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"active"}' | jq

echo -e "\n33. Filter Programs by Status (active)"
curl -s -H "Authorization: Bearer $JWT_TOKEN" "$BASE/api/v1/programs?status=active" | jq

echo -e "\n34. Clone Program"
CLONED_RESPONSE=$(curl -s -X POST $BASE/api/v1/programs/$PROGRAM_ID/clone \
  -H "Authorization: Bearer $JWT_TOKEN")
echo $CLONED_RESPONSE | jq
CLONED_ID=$(echo $CLONED_RESPONSE | jq -r '.id')
echo "Captured Cloned Program ID: $CLONED_ID"

echo -e "\n35. List All Programs (Should show 2 programs)"
curl -s -H "Authorization: Bearer $JWT_TOKEN" $BASE/api/v1/programs | jq

echo -e "\n36. Get Cloned Program (Should have same days as original)"
curl -s -H "Authorization: Bearer $JWT_TOKEN" $BASE/api/v1/programs/$CLONED_ID | jq

echo -e "\n37. Delete Workout Day from Original"
curl -s -X DELETE $BASE/api/v1/programs/$PROGRAM_ID/days/$DAY2_ID \
  -H "Authorization: Bearer $JWT_TOKEN"

echo -e "\n38. Get Original Program After Day Deletion (Should have 2 days)"
curl -s -H "Authorization: Bearer $JWT_TOKEN" $BASE/api/v1/programs/$PROGRAM_ID | jq

echo -e "\n39. Get Cloned Program (Should still have 3 days)"
curl -s -H "Authorization: Bearer $JWT_TOKEN" $BASE/api/v1/programs/$CLONED_ID | jq

echo -e "\n40. Update Cloned Program Status to Archived"
curl -s -X PATCH $BASE/api/v1/programs/$CLONED_ID/status \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"archived"}' | jq

echo -e "\n41. Delete Cloned Program"
curl -s -X DELETE $BASE/api/v1/programs/$CLONED_ID \
  -H "Authorization: Bearer $JWT_TOKEN"

echo -e "\n42. Delete Original Program"
curl -s -X DELETE $BASE/api/v1/programs/$PROGRAM_ID \
  -H "Authorization: Bearer $JWT_TOKEN"

echo -e "\n43. List All Programs (Should be empty or show other programs)"
curl -s -H "Authorization: Bearer $JWT_TOKEN" $BASE/api/v1/programs | jq

echo -e "\n========================================"
echo -e "Test Schedule Endpoints"
echo -e "========================================"

echo -e "\n44. Create Test Program for Scheduling"
SCHEDULE_PROGRAM_RESPONSE=$(curl -s -X POST $BASE/api/v1/programs \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Schedule Test Program",
    "weeks":4,
    "sourceJson":{"template":"schedule_test"}
  }')
echo $SCHEDULE_PROGRAM_RESPONSE | jq
SCHEDULE_PROGRAM_ID=$(echo $SCHEDULE_PROGRAM_RESPONSE | jq -r '.id')
echo "Captured Schedule Test Program ID: $SCHEDULE_PROGRAM_ID"

echo -e "\n45. Add Days to Schedule Test Program"
curl -s -X POST $BASE/api/v1/programs/$SCHEDULE_PROGRAM_ID/days \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"weekNumber":1,"dayNumber":1,"focus":"strength"}' | jq > /dev/null

curl -s -X POST $BASE/api/v1/programs/$SCHEDULE_PROGRAM_ID/days \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"weekNumber":1,"dayNumber":3,"focus":"cardio"}' | jq > /dev/null

curl -s -X POST $BASE/api/v1/programs/$SCHEDULE_PROGRAM_ID/days \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"weekNumber":1,"dayNumber":5,"focus":"strength"}' | jq > /dev/null

echo "Added 3 workout days to schedule test program"

echo -e "\n46. Set Schedule Test Program to Active"
curl -s -X PATCH $BASE/api/v1/programs/$SCHEDULE_PROGRAM_ID/status \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"active"}' | jq

echo -e "\n47. Generate Weekly Schedule (Now with active program)"
curl -s -X POST $BASE/api/v1/workouts/schedule/week \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"weekStart": "2025-01-20", "regenerate": true}' | jq

echo -e "\n48. Get Weekly Schedule"
curl -s -X GET "$BASE/api/v1/workouts/schedule/week?weekStart=2025-01-20" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq

echo -e "\n49. Get Upcoming Workout"
curl -s -X GET "$BASE/api/v1/workouts/schedule/upcoming" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq

echo -e "\n50. Cleanup: Delete Schedule Test Program"
curl -s -X DELETE $BASE/api/v1/programs/$SCHEDULE_PROGRAM_ID \
  -H "Authorization: Bearer $JWT_TOKEN"

echo -e "\n========================================"
echo -e "All Tests Complete"
echo -e "========================================"
