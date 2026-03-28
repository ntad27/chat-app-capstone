# Phase 01: Project Setup & Infrastructure

## Context
- **Parent plan:** [plan.md](./plan.md)
- **Dependencies:** None (first phase)
- **Docs:** [README.md](../../README.md)

## Overview
| Field | Value |
|-------|-------|
| Date | 2026-03-28 |
| Priority | P1 |
| Effort | 1h |
| Status | **DONE** (2026-03-28) |
| Description | Initialize monorepo with backend (FastAPI) and frontend (React+TS+Vite) scaffolding, dev tooling, Docker compose |

## Key Insights
- Greenfield project — zero existing config or source files
- Monorepo with `backend/` and `frontend/` directories keeps things simple
- Docker compose optional for local dev but useful for consistent environments
- `.env` must be gitignored (ANTHROPIC_API_KEY)

## Requirements
1. Python backend with FastAPI, uvicorn, claude-agent-sdk
2. React + TypeScript frontend with Vite, Zustand, Tailwind CSS
3. Shared environment configuration
4. Docker compose for single-command startup
5. ESLint + Prettier for frontend; Ruff for backend

## Architecture

```
chat-app-capstone/
├── backend/
│   ├── pyproject.toml
│   ├── requirements.txt
│   ├── .env.example
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI app entry
│   │   ├── config.py            # Settings via pydantic-settings
│   │   ├── agents/              # Agent definitions
│   │   │   └── __init__.py
│   │   ├── services/            # Business logic
│   │   │   └── __init__.py
│   │   └── routes/              # API endpoints
│   │       └── __init__.py
│   └── tests/
│       └── __init__.py
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── types/               # Shared type definitions
│   │   ├── stores/              # Zustand stores
│   │   ├── hooks/               # Custom hooks (SSE, etc.)
│   │   ├── components/          # UI components
│   │   ├── lib/                 # Decoder, tree builder
│   │   └── __tests__/           # Vitest tests
│   └── vitest.config.ts
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

## Related Code Files

| File | Action | Purpose |
|------|--------|---------|
| `backend/pyproject.toml` | Create | Python project config with dependencies |
| `backend/requirements.txt` | Create | Pinned dependencies for pip |
| `backend/app/main.py` | Create | FastAPI app with CORS, lifespan |
| `backend/app/config.py` | Create | Pydantic settings (ANTHROPIC_API_KEY, etc.) |
| `frontend/package.json` | Create | Node deps: react, zustand, tailwindcss |
| `frontend/vite.config.ts` | Create | Vite config with proxy to backend |
| `frontend/tailwind.config.ts` | Create | Tailwind setup |
| `frontend/tsconfig.json` | Create | Strict TS config |
| `docker-compose.yml` | Create | Backend + frontend services |
| `.env.example` | Create | Template for required env vars |
| `.gitignore` | Create | Python, Node, .env patterns |

## Implementation Steps

### Step 1: Root-level files

**`.gitignore`:**
```
# Python
__pycache__/
*.pyc
.venv/
*.egg-info/

# Node
node_modules/
dist/

# Environment
.env
.env.local

# IDE
.vscode/
.idea/
```

**`.env.example`:**
```
ANTHROPIC_API_KEY=sk-ant-...
```

### Step 2: Backend scaffolding

**`backend/pyproject.toml`:**
```toml
[project]
name = "deep-analyst-backend"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.30.0",
    "claude-agent-sdk>=0.86.0",
    "pydantic-settings>=2.0.0",
    "sse-starlette>=2.0.0",
    "python-dotenv>=1.0.0",
]

[project.optional-dependencies]
dev = ["pytest>=8.0.0", "pytest-asyncio>=0.24.0", "ruff>=0.5.0"]
```

**`backend/app/config.py`:**
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    anthropic_api_key: str
    model_name: str = "claude-sonnet-4-20250514"
    cors_origins: list[str] = ["http://localhost:5173"]

    class Config:
        env_file = ".env"

settings = Settings()
```

**`backend/app/main.py`:**
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings

app = FastAPI(title="Deep Analyst API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}
```

### Step 3: Frontend scaffolding

```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install zustand immer tailwindcss @tailwindcss/vite
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

**`frontend/vite.config.ts`:**
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
});
```

**`frontend/vitest.config.ts`:**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

### Step 4: Docker compose

**`docker-compose.yml`:**
```yaml
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
    env_file: .env
    volumes: ["./backend:/app"]
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  frontend:
    build: ./frontend
    ports: ["5173:5173"]
    volumes: ["./frontend:/app", "/app/node_modules"]
    command: npm run dev -- --host
    depends_on: [backend]
```

### Step 5: Verify

```bash
# Backend
cd backend && pip install -e ".[dev]" && uvicorn app.main:app --reload
# Frontend
cd frontend && npm install && npm run dev
# Test: curl http://localhost:8000/health
# Test: open http://localhost:5173
```

## Todo List

- [ ] Create `.gitignore` and `.env.example` at root
- [ ] Scaffold `backend/` with pyproject.toml, config, main.py
- [ ] Scaffold `frontend/` with Vite, React, TS, Zustand, Tailwind
- [ ] Create `docker-compose.yml`
- [ ] Verify both servers start and frontend proxies to backend
- [ ] Add Dockerfiles for backend and frontend

## Success Criteria

1. `uvicorn app.main:app` starts on port 8000, `/health` returns 200
2. `npm run dev` starts on port 5173, shows React app
3. Frontend proxy to `/api` reaches backend
4. `npm run test` and `pytest` both run (even with 0 tests)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| claude-agent-sdk version incompatibility | Medium | High | Pin exact version in requirements; test import on setup |
| Vite proxy issues | Low | Low | Fallback: explicit CORS + full URL in frontend |

## Next Steps
Proceed to [Phase 02: Backend — Agent System & SSE](./phase-02-backend.md)
