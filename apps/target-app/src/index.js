require('dotenv').config();
const express = require('express');
const app = express();

let serverStatus = 'online';
const PORT = process.env.TARGET_APP_PORT || 3001;

app.get('/status', (_req, res) => {
  res.json({ status: serverStatus });
});

app.get('/crash', (_req, res) => {
  serverStatus = 'offline';
  res.json({ message: 'Target app simulated offline state.' });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'target-app' });
});

app.listen(PORT, () => {
  console.log(`[target-app] running on http://localhost:${PORT}`);
});
