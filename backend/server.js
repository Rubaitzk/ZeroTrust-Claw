require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Global application state
// ---------------------------------------------------------------------------
let serverStatus = 'online';

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /status
 * Returns the current server status. Driven by the `serverStatus` variable
 * so the agent (or any caller) can poll for health.
 */
app.get('/status', (_req, res) => {
  res.json({ status: serverStatus });
});

/**
 * GET /crash
 * Simulates an application failure by flipping the status to 'offline'.
 * The server keeps running so it can still respond to /status checks —
 * useful for demonstrating the zero-trust recovery workflow.
 */
app.get('/crash', (_req, res) => {
  serverStatus = 'offline';
  res.json({ message: 'Server status set to offline.' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`[target-app] Server is running on http://localhost:${PORT}`);
});
