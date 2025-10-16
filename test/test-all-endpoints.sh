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

echo "1. Health Check"
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

echo -e "\n5. Register Device"
curl -s -X POST $BASE/api/v1/auth/devices \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"platform":"android","deviceId":"test-123","pushToken":"fcm-token"}' | jq