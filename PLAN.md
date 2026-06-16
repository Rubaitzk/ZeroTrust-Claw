# PLAN

## Goal
Build a decoupled Zero-Trust AI-driven DevOps observability architecture with separate services for the Discord chat interface, Auth0 approval gateway, OpenClaw agent wrapper, and monitored target application.

## Scope
- Separate the Discord bot from agent execution.
- Enforce Auth0 Admin approval over destructive actions.
- Use Redis for approval state and RabbitMQ for async coordination.
- Orchestrate services with Docker Compose.
- Track progress in `PROGRESS.md`.

## Service layout
- `apps/target-app/`
- `apps/auth0-gate/`
- `apps/agent-wrapper/`
- `apps/chat-interface/`

## Implementation steps
1. Scaffold service directories and package metadata.
2. Implement `target-app` with health and failure endpoints only.
3. Implement `auth0-gate` with secure approval transaction APIs and Admin role enforcement.
4. Implement `agent-wrapper` to create approval flows and execute actions once authorized.
5. Update `chat-interface` to call the agent wrapper instead of shelling out.
6. Add `.env.example`, `docker-compose.yml`, and Dockerfiles.
7. Harden the approval reset flow and remove any shared global approval state.

## Validation
- Confirm each service runs independently.
- Confirm approval URLs are generated only for destructive intents.
- Confirm only Auth0 Admin users can approve.
- Confirm approvals are single-use and reset after completion.
