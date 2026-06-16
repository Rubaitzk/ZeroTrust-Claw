from pathlib import Path
import os
import json

import discord
import httpx
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BASE_DIR / ".env")

TARGET_APP_URL = os.getenv("TARGET_APP_URL", "http://localhost:3001")
AGENT_WRAPPER_URL = os.getenv("AGENT_WRAPPER_URL", "http://localhost:3003")
DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")

intents = discord.Intents.default()
intents.message_content = True
client = discord.Client(intents=intents)
http_client = httpx.AsyncClient(timeout=10.0)


def format_result(result: object) -> str:
    if isinstance(result, (dict, list)):
        return json.dumps(result, indent=2)
    return str(result)


@client.event
async def on_ready():
    print(f"[chat-interface] logged in as {client.user}")


@client.event
async def on_message(message: discord.Message):
    if message.author.bot:
        return

    content = message.content.strip()

    if content == "!status":
        try:
            response = await http_client.get(f"{TARGET_APP_URL.rstrip('/')}/status")
            response.raise_for_status()
            data = response.json()
            await message.reply(f"🟢 Target app status: **{data.get('status')}**")
        except Exception as error:
            await message.reply("⚠️ Could not reach target application.")
            print("[chat-interface] status error", error)
        return

    if content == "!crash":
        try:
            await http_client.get(f"{TARGET_APP_URL.rstrip('/')}/crash")
            await message.reply("🔴 Target app has been instructed to simulate offline state.")
        except Exception as error:
            await message.reply("⚠️ Could not reach target application.")
            print("[chat-interface] crash error", error)
        return

    if content.startswith("!check "):
        transaction_id = content[7:].strip()
        if not transaction_id:
            await message.reply("⚠️ Please provide a transaction ID.")
            return
        try:
            response = await http_client.get(f"{AGENT_WRAPPER_URL.rstrip('/')}/action/status/{transaction_id}")
            response.raise_for_status()
            body = response.json()
            approval = body.get("approval") or {}
            await message.reply(f"📡 Approval status for {transaction_id}: {approval.get('status', body.get('status'))}")
        except Exception as error:
            await message.reply("⚠️ Could not retrieve approval status.")
            print("[chat-interface] check error", error)
        return

    if content.startswith("!complete "):
        transaction_id = content[10:].strip()
        if not transaction_id:
            await message.reply("⚠️ Please provide a transaction ID.")
            return
        try:
            response = await http_client.post(
                f"{AGENT_WRAPPER_URL.rstrip('/')}/action/complete",
                json={"transactionId": transaction_id},
            )
            payload = response.json()
            if response.status_code != 200:
                await message.reply(f"⚠️ Complete failed: {payload.get('detail') or payload}")
                return
            await message.reply(f"✅ Action completed: {format_result(payload.get('result'))}")
        except Exception as error:
            await message.reply("⚠️ Could not complete the authorized action.")
            print("[chat-interface] complete error", error)
        return

    if content.startswith("!"):
        return

    try:
        payload = {
            "text": content,
            "requester": f"{message.author.name}#{message.author.discriminator}",
            "userId": str(message.author.id),
        }
        response = await http_client.post(
            f"{AGENT_WRAPPER_URL.rstrip('/')}/action",
            json=payload,
        )
        body = response.json()

        if body.get("status") == "pending":
            await message.reply(
                f"⚠️ Action requires approval. Please authorize here:\n{body.get('approvalUrl')}\n\nThen use '!complete {body.get('transactionId')}' once approved."
            )
            return

        if body.get("status") == "completed":
            await message.reply(f"✅ {format_result(body.get('result'))}")
            return

        await message.reply(f"ℹ️ {body.get('message') or 'No action was taken.'}")
    except Exception as error:
        await message.reply("⚠️ Failed to forward your request to the agent wrapper.")
        print("[chat-interface] forward error", error)


if __name__ == "__main__":
    if not DISCORD_TOKEN:
        raise RuntimeError("DISCORD_TOKEN is required")
    client.run(DISCORD_TOKEN)
