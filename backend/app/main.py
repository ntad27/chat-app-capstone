from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes import sessions, stream

app = FastAPI(title="Deep Analyst API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(sessions.router)
app.include_router(stream.router)


@app.get("/health")
async def health():
    return {"status": "ok", "mock_mode": settings.mock_mode}
