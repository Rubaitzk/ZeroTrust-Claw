# ZeroTrust-Claw

An AI-driven DevOps observability agent with Zero-Trust security, designed for autonomous server management and secure remote administration.

## Architecture

This project uses a decoupled microservice architecture:
- **target-app**: Monitored Express application with health endpoints.
- **auth0-gate**: Auth0 approval gateway for destructive actions.
- **agent-wrapper**: OpenClaw agent coordination service.
- **chat-interface**: Discord bot for remote administration.

## Setup

1. **Clone and navigate**:
   ```bash
   git clone <repo-url>
   cd ZeroTrust-Claw
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your DISCORD_TOKEN, Auth0 credentials, and INTERNAL_API_KEY
   ```

3. **Start services**:
   ```bash
   docker compose up --build
   ```

   Or run individual services:
   ```bash
   npm run start:target-app
   npm run start:auth0-gate
   npm run start:agent-wrapper
   npm run start:chat-interface
   ```

## Usage

- Invite the Discord bot to your server.
- Use `!status` to check target app health.
- Use `!crash` to simulate a failure.
- Send natural language commands for AI-driven actions (destructive ones require Auth0 approval).

## Security

- Destructive actions require Auth0 authentication with Admin role.
- Approvals are transaction-scoped and reset after execution.
- Services are isolated; target-app has no approval logic.

See `ARCHITECTURE.md` for detailed design and `PLAN.md` for implementation roadmap.