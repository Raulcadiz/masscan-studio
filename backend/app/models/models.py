from sqlmodel import SQLModel, Field
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Database models (SQLModel table=True)
# ---------------------------------------------------------------------------

class Scan(SQLModel, table=True):
    __tablename__ = "scans"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: Optional[str] = Field(default=None)
    targets: str = Field(index=True)        # e.g. "192.168.1.0/24"
    ports: str                               # e.g. "80,443,8080-8090"
    rate: int = Field(default=1000)
    status: str = Field(default="pending")   # pending | running | completed | failed
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    nmap_enabled: bool = Field(default=False)
    hosts_count: int = Field(default=0)
    ports_count: int = Field(default=0)


class Host(SQLModel, table=True):
    __tablename__ = "hosts"

    id: Optional[int] = Field(default=None, primary_key=True)
    scan_id: int = Field(foreign_key="scans.id", index=True)
    ip: str = Field(index=True)
    hostname: Optional[str] = None
    os_guess: Optional[str] = None


class Port(SQLModel, table=True):
    __tablename__ = "ports"

    id: Optional[int] = Field(default=None, primary_key=True)
    host_id: int = Field(foreign_key="hosts.id", index=True)
    port: int = Field(index=True)
    protocol: str = Field(default="tcp")
    state: str = Field(default="open")
    service: Optional[str] = None
    version: Optional[str] = None
    banner: Optional[str] = None
    reason: Optional[str] = None


# ---------------------------------------------------------------------------
# Pydantic schemas (request / response)
# ---------------------------------------------------------------------------

class ScanCreate(BaseModel):
    name: Optional[str] = None
    targets: str
    ports: str = "21,22,23,25,53,80,110,135,139,143,443,445,993,995,3306,3389,5900,8080,8443"
    rate: int = Field(default=1000, ge=100, le=100000)
    nmap_enabled: bool = False


class PortOut(BaseModel):
    id: int
    port: int
    protocol: str
    state: str
    service: Optional[str]
    version: Optional[str]
    banner: Optional[str]
    reason: Optional[str]

    model_config = {"from_attributes": True}


class HostOut(BaseModel):
    id: int
    ip: str
    hostname: Optional[str]
    os_guess: Optional[str]
    ports: List[PortOut] = []

    model_config = {"from_attributes": True}


class ScanOut(BaseModel):
    id: int
    name: Optional[str]
    targets: str
    ports: str
    rate: int
    status: str
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error_message: Optional[str]
    nmap_enabled: bool
    hosts_count: int
    ports_count: int

    model_config = {"from_attributes": True}


class ScanCompareRequest(BaseModel):
    scan_id_a: int
    scan_id_b: int


class DiffSummary(BaseModel):
    new_hosts_count: int
    removed_hosts_count: int
    changed_hosts_count: int
    new_ports_total: int
    closed_ports_total: int


class ScanDiffOut(BaseModel):
    scan_a: int
    scan_b: int
    new_hosts: List[str]
    removed_hosts: List[str]
    new_ports: dict        # {ip: [port, ...]}
    closed_ports: dict     # {ip: [port, ...]}
    summary: DiffSummary
