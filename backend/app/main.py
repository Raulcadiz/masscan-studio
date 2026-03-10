from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db.database import create_db_and_tables
from app.api import scans, hosts, ports, reports


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


@app.get("/", tags=["health"])
def root():
    return {"message": "Masscan Studio API", "version": "0.1.0"}


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
