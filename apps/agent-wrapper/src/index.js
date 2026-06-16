require('dotenv').config();
const express = require('express');
const https = require('https');
const http = require('http');

const app = express();
app.use(express.json());

const PORT = process.env.AGENT_WRAPPER_PORT || 3003;
const AUTH0_GATE_URL = process.env.AUTH0_GATE_URL || 'http://localhost:3002';
const TARGET_APP_URL = process.env.TARGET_APP_URL || 'http://localhost:3001';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'internal-secret';

const requestJson = (url, options = {}) => {
  const client = url.startsWith('https://') ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(body || '{}');
          resolve({ status: res.statusCode, body: json });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
};

const isDestructive = (text) => {
  const destructiveKeywords = [
    'restart',
    'recover',
    'fix the crash',
    'bring it back online',
    'deploy',
    'modify source',
    'shutdown',
    'reboot',
    'kill',
  ];
  const normalized = text.toLowerCase();
  return destructiveKeywords.some((keyword) => normalized.includes(keyword));
};

app.post('/action', async (req, res) => {
  const { text, requester, userId } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Missing required field: text' });
  }

  if (isDestructive(text)) {
    const payload = JSON.stringify({ action: text, requester: requester || userId || 'unknown' });
    const response = await requestJson(`${AUTH0_GATE_URL}/approval/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      body: payload,
    });

    if (response.status >= 400) {
      return res.status(response.status).json(response.body);
    }

    return res.json({
      status: 'pending',
      approvalUrl: response.body.approvalUrl,
      transactionId: response.body.transactionId,
      message: 'Approval required for destructive action.',
    });
  }

  if (/status|health|alive|running/.test(text.toLowerCase())) {
    const response = await requestJson(`${TARGET_APP_URL}/status`, { method: 'GET' });
    return res.json({ status: 'completed', result: response.body });
  }

  return res.json({
    status: 'unhandled',
    message: 'The agent wrapper did not recognize a safe action. If this is a destructive request, it will require approval.',
  });
});

app.get('/action/status/:transactionId', async (req, res) => {
  const { transactionId } = req.params;
  const response = await requestJson(`${AUTH0_GATE_URL}/approval/status/${transactionId}`, { method: 'GET' });
  if (response.status === 404) {
    return res.status(404).json(response.body);
  }
  return res.json({ status: 'pending', approval: response.body });
});

app.post('/action/complete', async (req, res) => {
  const { transactionId } = req.body;
  if (!transactionId) {
    return res.status(400).json({ error: 'Missing required field: transactionId' });
  }

  const statusResponse = await requestJson(`${AUTH0_GATE_URL}/approval/status/${transactionId}`, { method: 'GET' });
  if (statusResponse.status !== 200) {
    return res.status(statusResponse.status).json(statusResponse.body);
  }

  const approval = statusResponse.body;
  if (approval.status !== 'Approved') {
    return res.status(403).json({ error: 'Action not approved yet', approval });
  }

  const result = {
    action: approval.action,
    requester: approval.requester,
    approvedBy: approval.approvedBy,
    approvedAt: approval.approvedAt,
    result: `Destructive action authorized: ${approval.action}`,
  };

  await requestJson(`${AUTH0_GATE_URL}/approval/reset/${transactionId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-api-key': INTERNAL_API_KEY,
    },
  });

  return res.json({ status: 'completed', result });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'agent-wrapper' });
});

app.listen(PORT, () => {
  console.log(`[agent-wrapper] running on http://localhost:${PORT}`);
});
