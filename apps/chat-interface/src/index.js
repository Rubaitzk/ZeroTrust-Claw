require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const fetch = global.fetch;

const TARGET_APP_URL = process.env.TARGET_APP_URL || 'http://localhost:3001';
const AGENT_WRAPPER_URL = process.env.AGENT_WRAPPER_URL || 'http://localhost:3003';
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once('ready', () => {
  console.log(`[chat-interface] logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();

  if (content === '!status') {
    try {
      const response = await fetch(`${TARGET_APP_URL}/status`);
      const data = await response.json();
      return await message.reply(`🟢 Target app status: **${data.status}**`);
    } catch (err) {
      console.error('[chat-interface] /status error', err);
      return await message.reply('⚠️ Could not reach target application.');
    }
  }

  if (content === '!crash') {
    try {
      await fetch(`${TARGET_APP_URL}/crash`);
      return await message.reply('🔴 Target app has been instructed to simulate offline state.');
    } catch (err) {
      console.error('[chat-interface] /crash error', err);
      return await message.reply('⚠️ Could not reach target application.');
    }
  }

  if (content.startsWith('!check ')) {
    const transactionId = content.slice(7).trim();
    if (!transactionId) {
      return await message.reply('⚠️ Please provide a transaction ID.');
    }
    try {
      const response = await fetch(`${AGENT_WRAPPER_URL}/action/status/${transactionId}`);
      const body = await response.json();
      return await message.reply(`📡 Approval status for ${transactionId}: ${body.approval?.status || body.status}`);
    } catch (err) {
      console.error('[chat-interface] /action/status error', err);
      return await message.reply('⚠️ Could not retrieve approval status.');
    }
  }

  if (content.startsWith('!complete ')) {
    const transactionId = content.slice(10).trim();
    if (!transactionId) {
      return await message.reply('⚠️ Please provide a transaction ID.');
    }
    try {
      const response = await fetch(`${AGENT_WRAPPER_URL}/action/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId }),
      });
      const body = await response.json();
      if (!response.ok) {
        return await message.reply(`⚠️ Complete failed: ${body.error || JSON.stringify(body)}`);
      }
      return await message.reply(`✅ Action completed: ${body.result?.result || JSON.stringify(body.result)}`);
    } catch (err) {
      console.error('[chat-interface] /action/complete error', err);
      return await message.reply('⚠️ Could not complete the authorized action.');
    }
  }

  if (content.startsWith('!')) return;

  try {
    const body = JSON.stringify({
      text: content,
      requester: `${message.author.username}#${message.author.discriminator}`,
      userId: message.author.id,
    });
    const response = await fetch(`${AGENT_WRAPPER_URL}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const payload = await response.json();

    if (payload.status === 'pending') {
      return await message.reply(`⚠️ Action requires approval. Please authorize here:\n${payload.approvalUrl}\n\nThen use \'!complete ${payload.transactionId}\' once approved.`);
    }

    if (payload.status === 'completed') {
      return await message.reply(`✅ ${JSON.stringify(payload.result)}`);
    }

    return await message.reply(`ℹ️ ${payload.message || 'No action was taken.'}`);
  } catch (err) {
    console.error('[chat-interface] /action error', err);
    return await message.reply('⚠️ Failed to forward your request to the agent wrapper.');
  }
});

client.login(process.env.DISCORD_TOKEN);
