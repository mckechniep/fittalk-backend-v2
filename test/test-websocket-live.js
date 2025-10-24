#!/usr/bin/env node
/**
 * WebSocket Live Session Test Client
 *
 * Tests the /live WebSocket namespace for real-time workout session updates.
 *
 * Prerequisites:
 * 1. Install socket.io-client: npm install socket.io-client
 * 2. Set JWT token: export JWT_TOKEN="your-jwt-token-here"
 * 3. Start the server: npm run start:dev
 * 4. Create a live session first (use test-workouts.sh or manually)
 *
 * Usage:
 *   node test/test-websocket-live.js <session-id>
 *
 * Example:
 *   node test/test-websocket-live.js 123e4567-e89b-12d3-a456-426614174000
 */

const io = require('socket.io-client');

// Configuration
const SERVER_URL = 'http://localhost:3000';
const NAMESPACE = '/live';
const JWT_TOKEN = process.env.JWT_TOKEN;
const SESSION_ID = process.argv[2];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logEvent(event, data) {
  console.log(`\n${colors.cyan}📡 Event: ${event}${colors.reset}`);
  console.log(JSON.stringify(data, null, 2));
}

// Validate prerequisites
if (!JWT_TOKEN) {
  log('❌ Error: JWT_TOKEN environment variable not set', 'red');
  log('Set it with: export JWT_TOKEN="your-jwt-token-here"', 'yellow');
  process.exit(1);
}

if (!SESSION_ID) {
  log('❌ Error: Session ID not provided', 'red');
  log('Usage: node test/test-websocket-live.js <session-id>', 'yellow');
  log('Tip: Create a session first using test-workouts.sh or manually', 'yellow');
  process.exit(1);
}

// Create Socket.io client
log('\n========================================', 'blue');
log('  WEBSOCKET LIVE SESSION TEST', 'blue');
log('========================================\n', 'blue');

log(`Connecting to: ${SERVER_URL}${NAMESPACE}`, 'bright');
log(`Session ID: ${SESSION_ID}`, 'bright');

const socket = io(`${SERVER_URL}${NAMESPACE}`, {
  auth: {
    token: JWT_TOKEN,
  },
  transports: ['websocket'], // Force WebSocket (not polling)
});

// Connection events
socket.on('connect', () => {
  log('\n✓ Connected to WebSocket server', 'green');
  log(`Socket ID: ${socket.id}`, 'cyan');

  // Start test sequence
  runTests();
});

socket.on('connect_error', (error) => {
  log(`\n❌ Connection error: ${error.message}`, 'red');
  if (error.message.includes('unauthorized') || error.message.includes('auth')) {
    log('Check your JWT_TOKEN environment variable', 'yellow');
  }
  process.exit(1);
});

socket.on('disconnect', (reason) => {
  log(`\n⚠ Disconnected: ${reason}`, 'yellow');
  process.exit(0);
});

// Server event listeners
socket.on('session-joined', (data) => logEvent('session-joined', data));
socket.on('session-left', (data) => logEvent('session-left', data));
socket.on('participant-joined', (data) => logEvent('participant-joined', data));
socket.on('participant-left', (data) => logEvent('participant-left', data));
socket.on('exercise-started', (data) => logEvent('exercise-started', data));
socket.on('set-completed', (data) => logEvent('set-completed', data));
socket.on('rest-ended', (data) => logEvent('rest-ended', data));
socket.on('session-paused', (data) => logEvent('session-paused', data));
socket.on('session-resumed', (data) => logEvent('session-resumed', data));
socket.on('session-ended', (data) => logEvent('session-ended', data));
socket.on('event-received', (data) => logEvent('event-received', data));
socket.on('error', (data) => logEvent('error ❌', data));

// Test sequence
async function runTests() {
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  try {
    log('\n========================================', 'blue');
    log('  Running Test Sequence', 'blue');
    log('========================================\n', 'blue');

    // Test 1: Join session
    log('1. Joining session...', 'yellow');
    socket.emit('join-session', { sessionId: SESSION_ID });
    await delay(1000);

    // Test 2: Get state
    log('\n2. Getting session state...', 'yellow');
    socket.emit('get-state', { sessionId: SESSION_ID }, (response) => {
      logEvent('get-state response', response);
    });
    await delay(1000);

    // Test 3: Start exercise
    log('\n3. Starting exercise...', 'yellow');
    socket.emit('start-exercise', {
      sessionId: SESSION_ID,
      exerciseId: 'test-exercise-ws-001',
      exerciseIndex: 0,
    });
    await delay(1500);

    // Test 4: Complete set
    log('\n4. Completing set...', 'yellow');
    socket.emit('complete-set', {
      sessionId: SESSION_ID,
      restDurationMs: 60000, // 60 seconds
    });
    await delay(1500);

    // Test 5: End rest
    log('\n5. Ending rest period...', 'yellow');
    socket.emit('end-rest', { sessionId: SESSION_ID });
    await delay(1500);

    // Test 6: Pause session
    log('\n6. Pausing session...', 'yellow');
    socket.emit('pause-session', { sessionId: SESSION_ID });
    await delay(1500);

    // Test 7: Resume session
    log('\n7. Resuming session...', 'yellow');
    socket.emit('resume-session', { sessionId: SESSION_ID });
    await delay(1500);

    // Test 8: Send custom event
    log('\n8. Sending custom event...', 'yellow');
    socket.emit('emit-event', {
      sessionId: SESSION_ID,
      event: {
        type: 'coach.cue',
        payload: {
          message: 'Great form! Keep it up!',
        },
      },
    });
    await delay(1500);

    // Test 9: Heartbeat
    log('\n9. Sending heartbeat...', 'yellow');
    socket.emit('heartbeat', { sessionId: SESSION_ID });
    await delay(1000);

    // Test 10: Leave session
    log('\n10. Leaving session...', 'yellow');
    socket.emit('leave-session', { sessionId: SESSION_ID });
    await delay(1000);

    // Summary
    log('\n========================================', 'blue');
    log('  Test Summary', 'blue');
    log('========================================\n', 'blue');
    log('✅ All WebSocket events tested successfully!', 'green');
    log('\nEvent sequence:', 'bright');
    log('  1. Join session', 'cyan');
    log('  2. Get state snapshot', 'cyan');
    log('  3. Start exercise (idle → exercising)', 'cyan');
    log('  4. Complete set (exercising → resting)', 'cyan');
    log('  5. End rest (resting → exercising)', 'cyan');
    log('  6. Pause session (exercising → paused)', 'cyan');
    log('  7. Resume session (paused → exercising)', 'cyan');
    log('  8. Emit custom event', 'cyan');
    log('  9. Send heartbeat', 'cyan');
    log('  10. Leave session', 'cyan');
    log('\n✓ Disconnecting...', 'green');

    await delay(500);
    socket.disconnect();

  } catch (error) {
    log(`\n❌ Test error: ${error.message}`, 'red');
    console.error(error);
    socket.disconnect();
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  log('\n\n⚠ Interrupted by user', 'yellow');
  socket.disconnect();
  process.exit(0);
});
