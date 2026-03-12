import asyncio
import sys

# Windows: asyncio.create_subprocess_exec requires ProactorEventLoop.
# Uvicorn defaults to SelectorEventLoop on Windows, which raises NotImplementedError.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db.database import create_db_and_tables
from app.api import scans, hosts, ports, reports, proxies

# Path to the compiled frontend (created by: cd frontend && npm run build)
_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield


app = FastAPI(
    title="Masscan Studio API",
    description="Visual network scanning platform powered by Masscan",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scans.router,   prefix="/api/scans",   tags=["scans"])
app.include_router(hosts.router,   prefix="/api/hosts",   tags=["hosts"])
app.include_router(ports.router,   prefix="/api/ports",   tags=["ports"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])
app.include_router(proxies.router, prefix="/api/proxies", tags=["proxies"])


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}


# ── Production: serve the compiled React frontend ─────────────────────────────
# Strategy: serve /assets/* as static files, serve index.html for root,
# and use a 404 exception handler (NOT a catch-all route) to handle all
# React Router paths.  This way the exception handler only fires AFTER all
# API routes have had a chance to match — no routing conflicts.
if _DIST.exists():
    _assets = _DIST / "assets"
    if _assets.exists():
        app.mount("/assets", StaticFiles(directory=str(_assets)), name="assets")

    @app.get("/", include_in_schema=False)
    async def serve_root():
        return FileResponse(str(_DIST / "index.html"))

    @app.exception_handler(404)
    async def spa_fallback(request: Request, exc: HTTPException):
        """
        Runs only when NO route matched.
        - /api/* paths  → return JSON 404 (real API miss)
        - everything else → serve index.html (React Router handles it)
        """
        if request.url.path.startswith("/api"):
            return JSONResponse({"detail": exc.detail}, status_code=404)
        index = _DIST / "index.html"
        if index.exists():
            return FileResponse(str(index))
        return JSONResponse({"detail": "Not found"}, status_code=404)

else:
    @app.get("/", tags=["health"])
    def root():
        return {
            "message": "Masscan Studio API",
            "version": "0.1.0",
            "hint": "Run 'cd frontend && npm run build' to serve the UI from this port.",
        }
