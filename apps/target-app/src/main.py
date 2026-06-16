from pathlib import Path
import os
# pyrefly: ignore [missing-import]
from dotenv import load_dotenv
# pyrefly: ignore [missing-import]
from fastapi import FastAPI

BASE_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BASE_DIR / ".env")

app = FastAPI()
server_status = "online"
PORT = int(os.getenv("TARGET_APP_PORT", 3001))

@app.get("/status")
async def get_status():
    return {"status": server_status}

@app.get("/crash")
async def simulate_crash():
    global server_status
    server_status = "offline"
    return {"message": "Target app simulated offline state."}

@app.get("/health")
async def health():
    return {"status": "ok", "service": "target-app"}

if __name__ == "__main__":
    # pyrefly: ignore [missing-import]
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
