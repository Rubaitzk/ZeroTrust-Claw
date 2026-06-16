require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { Client, GatewayIntentBits } = require('discord.js');
const { exec } = require('child_process');

// ---------------------------------------------------------------------------
// Discord client setup — we need message content intent to read commands
// ---------------------------------------------------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const TARGET_APP = 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Event: Ready
// ---------------------------------------------------------------------------
client.once('ready', () => {
  console.log(`[bot] Logged in as ${client.user.tag}`);
});

// ---------------------------------------------------------------------------
// Event: Message
// ---------------------------------------------------------------------------
client.on('messageCreate', async (message) => {
  // Ignore messages from bots (including ourselves)
  if (message.author.bot) return;

  const content = message.content.trim();

  // ── !status ──────────────────────────────────────────────────────────
  if (content === '!status') {
    try {
      const res = await fetch(`${TARGET_APP}/status`);
      const data = await res.json();
      await message.reply(`🟢 Target app status: **${data.status}**`);
    } catch (err) {
      await message.reply('⚠️ Could not reach the target app. Is it running?');
      console.error('[bot] /status fetch error:', err.message);
    }
    return;
  }

  // ── !crash ───────────────────────────────────────────────────────────
  if (content === '!crash') {
    try {
      await fetch(`${TARGET_APP}/crash`);
      await message.reply('🔴 System offline.');
    } catch (err) {
      await message.reply('⚠️ Could not reach the target app. Is it running?');
      console.error('[bot] /crash fetch error:', err.message);
    }
    return;
  }

  // ── Anything else — forward to OpenClaw ─────────────────────────────
  if (content.startsWith('!')) return; // ignore unknown bang-commands

  // Sanitize input: strip anything that isn't alphanumeric, whitespace,
  // or basic punctuation to prevent shell injection.
  const sanitized = content.replace(/[^a-zA-Z0-9 .,!?'\-]/g, '');

  if (!sanitized.length) {
    await message.reply('⚠️ Message contained no usable text after sanitization.');
    return;
  }

  console.log(`[bot] Forwarding to OpenClaw: "${sanitized}"`);

  // Show typing indicator while OpenClaw processes
  await message.channel.sendTyping();

  const cmd = `openclaw run "${sanitized}"`;

  exec(cmd, { cwd: require('path').resolve(__dirname, '..'), timeout: 60_000 }, async (err, stdout, stderr) => {
    if (err) {
      console.error('[bot] OpenClaw exec error:', err.message);
      const errorMsg = stderr?.trim() || err.message;
      await message.reply(`❌ OpenClaw error:\n\`\`\`\n${errorMsg.slice(0, 1800)}\n\`\`\``);
      return;
    }

    const output = stdout.trim();
    if (!output) {
      await message.reply('🤖 OpenClaw returned no output.');
      return;
    }

    // Discord messages are capped at 2000 characters
    if (output.length > 1900) {
      await message.reply(output.slice(0, 1900) + '\n… *(truncated)*');
    } else {
      await message.reply(output);
    }
  });
});

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
client.login(process.env.DISCORD_TOKEN);
