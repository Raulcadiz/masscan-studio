import asyncio
import sys

# Windows: asyncio.create_subprocess_exec requires ProactorEventLoop.
# Uvicorn defaults to SelectorEventLoop on Windows, which raises NotImplementedError.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db.database import create_db_and_tables
from app.api import scans, hosts, ports, reports

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
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scans.router, prefix="/api/scans", tags=["scans"])
app.include_router(hosts.router, prefix="/api/hosts", tags=["hosts"])
app.include_router(ports.router, prefix="/api/ports", tags=["ports"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}


# ── Production: serve the compiled React frontend ─────────────────────────────
# Only active when `frontend/dist/` exists (after `npm run build`).
# All React-Router paths are handled by the SPA catch-all at the bottom.
if _DIST.exists():
    # /assets/* → JS / CSS / images produced by Vite
    _assets = _DIST / "assets"
    if _assets.exists():
        app.mount("/assets", StaticFiles(directory=str(_assets)), name="assets")

    @app.get("/", include_in_schema=False)
    async def serve_root():
        return FileResponse(str(_DIST / "index.html"))

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        # Serve exact static file if it exists (favicon, manifest, etc.)
        candidate = _DIST / full_path
        if candidate.is_file():
            return FileResponse(str(candidate))
        # Otherwise serve index.html so React-Router handles the path
        return FileResponse(str(_DIST / "index.html"))
else:
    @app.get("/", tags=["health"])
    def root():
        return {
            "message": "Masscan Studio API",
            "version": "0.1.0",
            "hint": "Run 'cd frontend && npm run build' to serve the UI from this port.",
        }
