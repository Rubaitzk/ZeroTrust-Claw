require('dotenv').config();
const express = require('express');
const { auth, requiresAuth } = require('express-openid-connect');
const { createClient } = require('redis');
const { v4: uuidv4 } = require('uuid');
const { hasAdminRole, buildApprovalUrl } = require('./auth');

const app = express();
app.use(express.json());

const PORT = process.env.AUTH0_GATE_PORT || 3002;
const BASE_URL = process.env.AUTH0_BASE_URL || `http://localhost:${PORT}`;
const ROLE_CLAIM = process.env.AUTH0_ROLE_CLAIM || 'https://example.com/roles';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'internal-secret';
const REDIS_URL = `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;

const redis = createClient({ url: REDIS_URL });
redis.on('error', (err) => console.error('[auth0-gate][redis]', err));
redis.connect();

const authConfig = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.AUTH0_CLIENT_SECRET || 'default-secret',
  baseURL: BASE_URL,
  clientID: process.env.AUTH0_CLIENT_ID || 'your-client-id',
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL || 'https://example.com/',
  routes: {
    callback: '/auth/callback',
    login: '/login',
    logout: '/logout',
  },
  authorizationParams: {
    response_type: 'code',
    scope: 'openid profile email',
  },
};

app.use(auth(authConfig));

const approvalKey = (id) => `approval:${id}`;
const expiresInSeconds = 600;

app.post('/approval/request', async (req, res) => {
  const { action, requester } = req.body;
  if (!action) {
    return res.status(400).json({ error: 'Missing required field: action' });
  }

  const transactionId = uuidv4();
  const payload = {
    transactionId,
    action,
    requester: requester || 'unknown',
    status: 'Pending',
    createdAt: new Date().toISOString(),
  };

  await redis.setEx(approvalKey(transactionId), expiresInSeconds, JSON.stringify(payload));

  return res.status(201).json({
    transactionId,
    approvalUrl: buildApprovalUrl(BASE_URL, transactionId),
    status: 'Pending',
    expiresIn: expiresInSeconds,
  });
});

app.get('/approval/status/:transactionId', async (req, res) => {
  const { transactionId } = req.params;
  const stored = await redis.get(approvalKey(transactionId));
  if (!stored) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  const payload = JSON.parse(stored);
  return res.json(payload);
});

app.get('/approval/authorize/:transactionId', requiresAuth(), async (req, res) => {
  const { transactionId } = req.params;
  const stored = await redis.get(approvalKey(transactionId));
  if (!stored) {
    return res.status(404).send('Approval request not found.');
  }

  const payload = JSON.parse(stored);
  if (!hasAdminRole(req.oidc.user)) {
    return res.status(403).send('Access denied. Admin role is required to approve this request.');
  }

  payload.status = 'Approved';
  payload.approvedBy = req.oidc.user.name || req.oidc.user.email || 'admin';
  payload.approvedAt = new Date().toISOString();

  await redis.setEx(approvalKey(transactionId), expiresInSeconds, JSON.stringify(payload));

  return res.send(`<!doctype html><html><body style="font-family: system-ui, sans-serif; text-align: center; padding: 4rem;"><h1>✅ Authorization Confirmed</h1><p>Transaction <strong>${transactionId}</strong> has been approved.</p><p>You may now return to the operator interface.</p></body></html>`);
});

app.post('/approval/reset/:transactionId', async (req, res) => {
  const { transactionId } = req.params;
  const incomingKey = req.header('x-internal-api-key');
  if (incomingKey !== INTERNAL_API_KEY) {
    return res.status(403).json({ error: 'Invalid internal API key' });
  }

  const stored = await redis.get(approvalKey(transactionId));
  if (!stored) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  const payload = JSON.parse(stored);
  payload.status = 'Pending';
  payload.approvedBy = undefined;
  payload.approvedAt = undefined;
  payload.resetAt = new Date().toISOString();

  await redis.setEx(approvalKey(transactionId), expiresInSeconds, JSON.stringify(payload));
  return res.json({ transactionId, status: payload.status });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'auth0-gate' });
});

app.listen(PORT, () => {
  console.log(`[auth0-gate] running on ${BASE_URL}`);
});
