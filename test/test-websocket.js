#!/usr/bin/env node

/**
 * WebSocket Live Session Test
 * 
 * Tests real-time WebSocket functionality for live workout sessions.
 * 
 * Usage:
 *   JWT_TOKEN="token" node test/test-websocket.js <sessionId> [duration]
 * 
 * Arguments:
 *   sessionId - Live session ID to connect to
 *   duration  - Test duration in seconds (default: 10)
 * 
 * Environment:
 *   JWT_TOKEN - Authentication token (required)
 *   WS_URL    - WebSocket server URL (default: http://localhost:3000)
 */

const io = require('socket.io-client');

// Parse arguments
const sessionId = process.argv[2];
const duration = parseInt(process.argv[3] || '10', 10);
const wsUrl = process.env.WS_URL || 'http://localhost:3000';
const token = process.env.JWT_TOKEN;

// Validation
if (!sessionId) {
  console.error('❌ Usage: JWT_TOKEN="token" node test/test-websocket.js <sessionId> [duration]');
  process.exit(1);
}

if (!token) {
  console.error('❌ JWT_TOKEN environment variable required');
  console.error('   Set it with: export JWT_TOKEN="your-token"');
  process.exit(1);
}

// Test state tracking
let connected = false;
let authenticated = false;
let joinedRoom = false;
let updatesReceived = 0;
let errorsReceived = 0;

console.log(`\n🔌 Connecting to: ${wsUrl}/live`);
console.log(`📋 Session ID: ${sessionId}`);
console.log(`⏱️  Duration: ${duration} seconds\n`);

// Create socket connection to /live namespace
const socket = io(`${wsUrl}/live`, {
  auth: { token },
  transports: ['websocket'],
  reconnection: false,
});

// Connection events
socket.on('connect', () => {
  connected = true;
  console.log('✅ Connected to WebSocket server');
  // Note: Gateway handles auth automatically on connection
});

socket.on('disconnect', (reason) => {
  console.log(`⚠️  Disconnected: ${reason}`);
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection failed:', error.message);
  process.exit(1);
});

// Authentication/connection confirmation (gateway emits 'connected' after auth)
socket.on('connected', (data) => {
  authenticated = true;
  console.log('✅ Authenticated successfully');
  console.log(`   User ID: ${data.data.userId}`);
  
  // Now join the session room
  console.log('\n📡 Joining session room...');
  socket.emit('join-session', { sessionId });
});

socket.on('error', (error) => {
  errorsReceived++;
  console.error('❌ Error:', error.message || error);
});

// Session events (kebab-case to match gateway)
socket.on('session-joined', (data) => {
  joinedRoom = true;
  console.log(`✅ Joined session room: ${sessionId}`);
  if (data.data && data.data.state) {
    console.log(`   Session status: ${data.data.state.status}`);
  }
});

// Live session state updates (kebab-case)
socket.on('state-updated', (data) => {
  updatesReceived++;
  const stateData = data.data || data;
  console.log('📡 State update:', {
    status: stateData.status,
    exercise: stateData.currentExerciseId || 'none',
    set: stateData.currentSetNumber || 0,
  });
});

socket.on('exercise-started', (data) => {
  console.log('🏋️  Exercise started:', data.data?.exerciseId || data.exerciseId);
});

socket.on('set-completed', (data) => {
  console.log('✅ Set completed, rest:', (data.data?.restDurationMs || data.restDurationMs) + 'ms');
});

socket.on('heartbeat', (data) => {
  console.log('💓 Heartbeat received');
});

// Generic error handler
socket.on('error', (error) => {
  errorsReceived++;
  console.error('❌ Socket error:', error);
});

// Test timeout - print summary and exit
setTimeout(() => {
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  
  console.log('\nConnection:');
  console.log(`  Connected:     ${connected ? '✅' : '❌'}`);
  console.log(`  Authenticated: ${authenticated ? '✅' : '❌'}`);
  console.log(`  Joined Room:   ${joinedRoom ? '✅' : '❌'}`);
  
  console.log('\nActivity:');
  console.log(`  Updates:       ${updatesReceived}`);
  console.log(`  Errors:        ${errorsReceived}`);
  
  // Determine success
  const success = connected && authenticated && joinedRoom && errorsReceived === 0;
  
  console.log('\n' + '='.repeat(60));
  if (success) {
    console.log('✅ WebSocket Test PASSED');
  } else {
    console.log('❌ WebSocket Test FAILED');
  }
  console.log('='.repeat(60) + '\n');
  
  socket.disconnect();
  process.exit(success ? 0 : 1);
}, duration * 1000);

// Graceful shutdown handlers
process.on('SIGINT', () => {
  console.log('\n⚠️  Test interrupted by user');
  socket.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⚠️  Test terminated');
  socket.disconnect();
  process.exit(0);
});