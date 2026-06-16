from pathlib import Path
import os
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse
import httpx

BASE_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BASE_DIR / ".env")

PORT = int(os.getenv("AGENT_WRAPPER_PORT", 3003))
AUTH0_GATE_URL = os.getenv("AUTH0_GATE_URL", "http://localhost:3002")
TARGET_APP_URL = os.getenv("TARGET_APP_URL", "http://localhost:3001")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "internal-secret")

app = FastAPI()


async def request_json(method: str, url: str, **kwargs: Any) -> dict[str, Any]:
    async with httpx.AsyncClient() as client:
        response = await client.request(method, url, **kwargs)
        try:
            body = response.json()
        except ValueError:
            body = {"raw": response.text}
        return {"status_code": response.status_code, "body": body}


def is_destructive(text: str) -> bool:
    destructive_keywords = [
        "restart",
        "recover",
        "fix the crash",
        "bring it back online",
        "deploy",
        "modify source",
        "shutdown",
        "reboot",
        "kill",
    ]
    normalized = text.lower()
    return any(keyword in normalized for keyword in destructive_keywords)


@app.post("/action")
async def submit_action(request: Request):
    payload = await request.json()
    text = payload.get("text", "").strip()
    requester = payload.get("requester") or payload.get("userId") or "unknown"

    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing required field: text")

    if is_destructive(text):
        response = await request_json(
            "POST",
            f"{AUTH0_GATE_URL.rstrip('/')}/approval/request",
            json={"action": text, "requester": requester},
        )
        if response["status_code"] >= 400:
            raise HTTPException(status_code=response["status_code"], detail=response["body"])

        return JSONResponse(content={
            "status": "pending",
            "approvalUrl": response["body"].get("approvalUrl"),
            "transactionId": response["body"].get("transactionId"),
            "message": "Approval required for destructive action.",
        })

    if any(term in text.lower() for term in ["status", "health", "alive", "running"]):
        response = await request_json("GET", f"{TARGET_APP_URL.rstrip('/')}/status")
        return JSONResponse(content={"status": "completed", "result": response["body"]})

    return JSONResponse(
        content={
            "status": "unhandled",
            "message": "The agent wrapper did not recognize a safe action. If this is a destructive request, it will require approval.",
        }
    )


@app.get("/action/status/{transaction_id}")
async def action_status(transaction_id: str):
    response = await request_json("GET", f"{AUTH0_GATE_URL.rstrip('/')}/approval/status/{transaction_id}")
    if response["status_code"] == 404:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=response["body"])
    return JSONResponse(content={"status": "pending", "approval": response["body"]})


@app.post("/action/complete")
async def complete_action(request: Request):
    payload = await request.json()
    transaction_id = payload.get("transactionId")
    if not transaction_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing required field: transactionId")

    status_response = await request_json("GET", f"{AUTH0_GATE_URL.rstrip('/')}/approval/status/{transaction_id}")
    if status_response["status_code"] != 200:
        raise HTTPException(status_code=status_response["status_code"], detail=status_response["body"])

    approval = status_response["body"]
    if approval.get("status") != "Approved":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "Action not approved yet", "approval": approval})

    await request_json(
        "POST",
        f"{AUTH0_GATE_URL.rstrip('/')}/approval/reset/{transaction_id}",
        headers={"x-internal-api-key": INTERNAL_API_KEY},
    )

    result = {
        "action": approval.get("action"),
        "requester": approval.get("requester"),
        "approvedBy": approval.get("approvedBy"),
        "approvedAt": approval.get("approvedAt"),
        "result": f"Destructive action authorized: {approval.get('action')}",
    }

    return JSONResponse(content={"status": "completed", "result": result})


@app.get("/health")
async def health():
    return {"status": "ok", "service": "agent-wrapper"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
