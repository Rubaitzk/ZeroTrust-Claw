require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { Client, GatewayIntentBits } = require('discord.js');

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

  // ── Anything else — log for now (OpenClaw intercept point) ──────────
  console.log(`[bot] Unhandled message from ${message.author.tag}: "${content}"`);
});

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
client.login(process.env.DISCORD_TOKEN);
