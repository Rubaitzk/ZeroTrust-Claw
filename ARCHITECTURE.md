# Zero-Trust AI Agent Architecture

## Overview
This repository now uses a decoupled microservice architecture to separate the Discord chat interface, Auth0 approval gateway, agent wrapper, and the monitored target application.

## System Components

### 1. Target Application
A lightweight Express service exposing only safe monitoring endpoints.
- `/status` for health checks
- `/crash` to simulate an offline state
- No approval or Auth0 logic is hosted here.

### 2. Auth0 Gate
A dedicated approval service responsible for secure sign-in and approval state.
- Creates one-time approval transactions in Redis.
- Provides a secure approval URL to an Auth0-protected route.
- Validates `Admin` role claims before approving any action.
- Exposes status and reset APIs for internal services.

### 3. Agent Wrapper
A separate service that coordinates destructive actions.
- Accepts action requests from the Discord bot.
- Detects destructive intent and forwards approval requests to the Auth0 gate.
- Polls approval status and executes approved actions safely.
- Resets approval state immediately after completion.

### 4. Chat Interface
The Discord bot frontend for operators.
- Sends status and crash requests directly to `target-app`.
- Sends custom instructions to `agent-wrapper` for evaluation.
- Relays approval URLs and transaction status commands to users.

## Zero-Trust Flow
1. The operator sends a request through Discord.
2. The bot forwards the request to `agent-wrapper`.
3. If the action is destructive, `agent-wrapper` requests approval from `auth0-gate`.
4. `auth0-gate` creates a transaction and returns an Auth0-secured approval URL.
5. The operator authenticates via Auth0 and completes the approval flow.
6. `agent-wrapper` verifies the approval status.
7. The action is executed only after valid approval, then the transaction is reset.

## Deployment
- Local orchestration uses `docker-compose.yml`.
- Services include `redis`, `rabbitmq`, `target-app`, `auth0-gate`, `agent-wrapper`, and `chat-interface`.
- Each service has its own Dockerfile and package metadata.
- Secrets are managed through environment variables and `.env.example`.

## Directory Structure
```text
ZeroTrust-Claw/
├── .agents/                        # OpenClaw agent configuration
│   └── skills/
│       └── secure-devops/
│           └── SKILL.md
├── apps/
│   ├── auth0-gate/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src/
│   │       ├── auth.js
│   │       └── index.js
│   ├── agent-wrapper/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src/index.js
│   ├── chat-interface/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src/index.js
│   └── target-app/
│       ├── Dockerfile
│       ├── package.json
│       └── src/index.js
├── ARCHITECTURE.md
├── docker-compose.yml
├── .env.example
├── PLAN.md
├── PROGRESS.md
└── package.json
```

## Security Principles
- Approval state is transaction-scoped, not global.
- Only Auth0 users with the `Admin` role may approve destructive actions.
- Internal reset endpoints require `INTERNAL_API_KEY`.
- The target application is isolated from approval and chat traffic.

## Status
This repository now contains a scaffolded decoupled architecture with separate app services, approval flow orchestration, and Docker Compose integration.
