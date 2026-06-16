from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from authlib.integrations.starlette_client import OAuth, OAuthError
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.sessions import SessionMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
import redis.asyncio as aioredis
from src.auth import has_admin_role

BASE_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BASE_DIR / ".env")

PORT = int(os.getenv("AUTH0_GATE_PORT", 3002))
BASE_URL = os.getenv("AUTH0_BASE_URL", f"http://localhost:{PORT}")
AUTH0_CLIENT_ID = os.getenv("AUTH0_CLIENT_ID", "")
AUTH0_CLIENT_SECRET = os.getenv("AUTH0_CLIENT_SECRET", "")
AUTH0_ISSUER_BASE_URL = os.getenv("AUTH0_ISSUER_BASE_URL", "https://example.com/")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "internal-secret")
SESSION_SECRET = os.getenv("SESSION_SECRET", AUTH0_CLIENT_SECRET or "change-me")
REDIS_URL = f"redis://{os.getenv('REDIS_HOST', 'localhost')}:{os.getenv('REDIS_PORT', '6379')}"

app = FastAPI()
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET, session_cookie="session")

oauth = OAuth()
oauth.register(
    name="auth0",
    client_id=AUTH0_CLIENT_ID,
    client_secret=AUTH0_CLIENT_SECRET,
    server_metadata_url=f"{AUTH0_ISSUER_BASE_URL.rstrip('/')}/.well-known/openid-configuration",
    client_kwargs={"scope": "openid profile email"},
)

redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)

APPROVAL_TTL_SECONDS = 600


def approval_key(transaction_id: str) -> str:
    return f"approval:{transaction_id}"


@app.on_event("startup")
async def startup_event():
    await redis_client.ping()


@app.get("/login")
async def login(request: Request):
    redirect_uri = request.url_for("auth_callback")
    return await oauth.auth0.authorize_redirect(request, redirect_uri)


@app.get("/auth/callback")
async def auth_callback(request: Request):
    try:
        token = await oauth.auth0.authorize_access_token(request)
    except OAuthError as error:
        return HTMLResponse(f"<h1>Auth0 callback failed</h1><p>{error.error}</p>", status_code=400)

    user = token.get("userinfo")
    if not user:
        user = await oauth.auth0.parse_id_token(request, token)

    request.session["user"] = dict(user)
    next_url = request.session.pop("next_url", "/")
    return RedirectResponse(url=next_url)


@app.post("/approval/request")
async def create_approval(request: Request):
    body = await request.json()
    action = body.get("action")
    requester = body.get("requester", "unknown")
    if not action:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing required field: action")

    transaction_id = os.urandom(16).hex()
    payload: dict[str, Any] = {
        "transactionId": transaction_id,
        "action": action,
        "requester": requester,
        "status": "Pending",
        "createdAt": datetime.utcnow().isoformat() + "Z",
    }
    await redis_client.setex(approval_key(transaction_id), APPROVAL_TTL_SECONDS, json.dumps(payload))

    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={
            "transactionId": transaction_id,
            "approvalUrl": f"{BASE_URL.rstrip('/')}/approval/authorize/{transaction_id}",
            "status": "Pending",
            "expiresIn": APPROVAL_TTL_SECONDS,
        },
    )


@app.get("/approval/status/{transaction_id}")
async def approval_status(transaction_id: str):
    stored = await redis_client.get(approval_key(transaction_id))
    if not stored:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
    return JSONResponse(content=json.loads(stored))


@app.get("/approval/authorize/{transaction_id}")
async def authorize_action(request: Request, transaction_id: str):
    user = request.session.get("user")
    if not user:
        request.session["next_url"] = str(request.url)
        return await login(request)

    if not has_admin_role(user):
        return HTMLResponse("<h1>Access denied</h1><p>Admin role is required to approve this request.</p>", status_code=status.HTTP_403_FORBIDDEN)

    stored = await redis_client.get(approval_key(transaction_id))
    if not stored:
        return HTMLResponse("<h1>Not found</h1><p>Approval request not found.</p>", status_code=status.HTTP_404_NOT_FOUND)

    payload = json.loads(stored)
    payload["status"] = "Approved"
    payload["approvedBy"] = user.get("name") or user.get("email") or "admin"
    payload["approvedAt"] = datetime.utcnow().isoformat() + "Z"
    await redis_client.setex(approval_key(transaction_id), APPROVAL_TTL_SECONDS, json.dumps(payload))

    return HTMLResponse(
        f"<!doctype html><html><body style=\"font-family: system-ui, sans-serif; text-align: center; padding: 4rem;\"><h1>✅ Authorization Confirmed</h1><p>Transaction <strong>{transaction_id}</strong> has been approved.</p><p>You may now return to the operator interface.</p></body></html>"
    )


@app.post("/approval/reset/{transaction_id}")
async def reset_approval(request: Request, transaction_id: str):
    incoming_key = request.headers.get("x-internal-api-key")
    if incoming_key != INTERNAL_API_KEY:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid internal API key")

    stored = await redis_client.get(approval_key(transaction_id))
    if not stored:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")

    payload = json.loads(stored)
    payload["status"] = "Pending"
    payload["approvedBy"] = None
    payload["approvedAt"] = None
    payload["resetAt"] = datetime.utcnow().isoformat() + "Z"
    await redis_client.setex(approval_key(transaction_id), APPROVAL_TTL_SECONDS, json.dumps(payload))

    return JSONResponse(content={"transactionId": transaction_id, "status": payload["status"]})


@app.get("/health")
async def health():
    return {"status": "ok", "service": "auth0-gate"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
