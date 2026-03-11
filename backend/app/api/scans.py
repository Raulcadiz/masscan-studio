from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlmodel import Session, select
from typing import List, Optional

from app.db.database import get_session
from app.models.models import (
    Host,
    HostOut,
    Port,
    Scan,
    ScanCompareRequest,
    ScanCreate,
    ScanDiffOut,
    ScanOut,
)
from app.core.scanner import ScanOrchestrator
from app.core.masscan_wrapper import MasscanWrapper
from app.core.diff import compare_scans
from app.api._utils import load_hosts_with_ports

router = APIRouter()
orchestrator = ScanOrchestrator()


# ---------------------------------------------------------------------------
# Create & start scan
# ---------------------------------------------------------------------------

@router.post("/", response_model=ScanOut, status_code=201)
def create_scan(
    payload: ScanCreate,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    scan = Scan(
        name=payload.name,
        targets=payload.targets,
        ports=payload.ports,
        rate=payload.rate,
        nmap_enabled=payload.nmap_enabled,
        status="pending",
    )
    session.add(scan)
    session.commit()
    session.refresh(scan)

    background_tasks.add_task(orchestrator.run, scan.id)
    return scan


# ---------------------------------------------------------------------------
# List & get scans
# ---------------------------------------------------------------------------

@router.get("/", response_model=List[ScanOut])
def list_scans(
    status: Optional[str] = None,
    session: Session = Depends(get_session),
):
    query = select(Scan).order_by(Scan.created_at.desc())
    if status:
        query = query.where(Scan.status == status)
    return session.exec(query).all()


@router.get("/{scan_id}", response_model=ScanOut)
def get_scan(scan_id: int, session: Session = Depends(get_session)):
    scan = session.get(Scan, scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan


# ---------------------------------------------------------------------------
# Hosts discovered in a scan
# ---------------------------------------------------------------------------

@router.get("/{scan_id}/hosts", response_model=List[HostOut])
def get_scan_hosts(scan_id: int, session: Session = Depends(get_session)):
    scan = session.get(Scan, scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return load_hosts_with_ports(scan_id, session)


# ---------------------------------------------------------------------------
# Delete scan
# ---------------------------------------------------------------------------

@router.delete("/{scan_id}", status_code=204)
def delete_scan(scan_id: int, session: Session = Depends(get_session)):
    scan = session.get(Scan, scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    # Cascade delete hosts and ports
    hosts = session.exec(select(Host).where(Host.scan_id == scan_id)).all()
    for host in hosts:
        ports = session.exec(select(Port).where(Port.host_id == host.id)).all()
        for port in ports:
            session.delete(port)
        session.delete(host)

    session.delete(scan)
    session.commit()


# ---------------------------------------------------------------------------
# Stop a running scan (saves partial results)
# ---------------------------------------------------------------------------

@router.post("/{scan_id}/stop", status_code=200)
def stop_scan(scan_id: int, session: Session = Depends(get_session)):
    scan = session.get(Scan, scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan.status not in ("running", "pending"):
        raise HTTPException(
            status_code=400,
            detail=f"Scan is not running (status: {scan.status})",
        )
    MasscanWrapper.kill_scan(scan_id)
    return {"message": "Stop signal sent. Partial results will be saved."}


# ---------------------------------------------------------------------------
# Compare two scans
# ---------------------------------------------------------------------------

@router.post("/compare", response_model=ScanDiffOut)
def compare(payload: ScanCompareRequest, session: Session = Depends(get_session)):
    for scan_id in (payload.scan_id_a, payload.scan_id_b):
        scan = session.get(Scan, scan_id)
        if not scan:
            raise HTTPException(status_code=404, detail=f"Scan {scan_id} not found")
        if scan.status != "completed":
            raise HTTPException(
                status_code=400,
                detail=f"Scan {scan_id} is not completed (status: {scan.status})",
            )

    return compare_scans(payload.scan_id_a, payload.scan_id_b)
