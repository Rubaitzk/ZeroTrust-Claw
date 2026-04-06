require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const express = require('express');
const { auth, requiresAuth } = require('express-openid-connect');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Zero-Trust approval state (used by the Auth0 handshake flow)
// ---------------------------------------------------------------------------
global.devOpsApprovalStatus = 'Pending';

// ---------------------------------------------------------------------------
// Auth0 configuration (express-openid-connect)
// ---------------------------------------------------------------------------
const config = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.AUTH0_SECRET,
  baseURL: process.env.AUTH0_BASE_URL,
  clientID: process.env.AUTH0_CLIENT_ID,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
};

app.use(auth(config));

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
// Zero-Trust Authorization Routes
// ---------------------------------------------------------------------------

/**
 * GET /admin/approve
 * Protected — requires Auth0 login. Once the user authenticates, flips the
 * global approval flag so OpenClaw knows it is authorized to act.
 */
app.get('/admin/approve', requiresAuth(), (_req, res) => {
  global.devOpsApprovalStatus = 'Approved';
  res.send(`
    <html>
      <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #0f172a; color: #e2e8f0;">
        <div style="text-align: center;">
          <h1>✅ Identity Verified!</h1>
          <p>OpenClaw is now authorized to act. You may close this window.</p>
        </div>
      </body>
    </html>
  `);
});

/**
 * GET /approval-status
 * Public — OpenClaw polls this endpoint to check whether an admin has
 * completed the Auth0 handshake.
 */
app.get('/approval-status', (_req, res) => {
  res.json({ status: global.devOpsApprovalStatus });
});

/**
 * GET /admin/reset-approval
 * Resets the approval state back to Pending after OpenClaw finishes
 * executing a privileged action.
 */
app.get('/admin/reset-approval', (_req, res) => {
  global.devOpsApprovalStatus = 'Pending';
  res.json({ status: global.devOpsApprovalStatus, message: 'Approval reset to Pending.' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`[target-app] Server is running on http://localhost:${PORT}`);
});
