from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select, func
from typing import List, Optional

from app.db.database import get_session
from app.models.models import Host, Port

router = APIRouter()


@router.get("/stats")
def port_stats(
    scan_id: Optional[int] = None,
    session: Session = Depends(get_session),
):
    """
    Returns port distribution: {port: count} sorted by count descending.
    Used for bar/pie charts in the dashboard.
    """
    query = (
        select(Port.port, func.count(Port.id).label("count"))
        .where(Port.state == "open")
        .group_by(Port.port)
        .order_by(func.count(Port.id).desc())
    )

    if scan_id:
        host_ids = select(Host.id).where(Host.scan_id == scan_id)
        query = query.where(Port.host_id.in_(host_ids))

    rows = session.exec(query).all()
    return [{"port": row.port, "count": row.count} for row in rows]


@router.get("/top")
def top_ports(
    limit: int = Query(default=20, le=100),
    scan_id: Optional[int] = None,
    session: Session = Depends(get_session),
):
    """Top N most open ports across all scans (or a specific scan)."""
    query = (
        select(Port.port, Port.protocol, func.count(Port.id).label("count"))
        .where(Port.state == "open")
        .group_by(Port.port, Port.protocol)
        .order_by(func.count(Port.id).desc())
        .limit(limit)
    )

    if scan_id:
        host_ids = select(Host.id).where(Host.scan_id == scan_id)
        query = query.where(Port.host_id.in_(host_ids))

    rows = session.exec(query).all()
    return [{"port": r.port, "protocol": r.protocol, "count": r.count} for r in rows]


@router.get("/services")
def service_distribution(
    scan_id: Optional[int] = None,
    session: Session = Depends(get_session),
):
    """Distribution of detected services (requires nmap enrichment)."""
    query = (
        select(Port.service, func.count(Port.id).label("count"))
        .where(Port.service.is_not(None))
        .group_by(Port.service)
        .order_by(func.count(Port.id).desc())
    )

    if scan_id:
        host_ids = select(Host.id).where(Host.scan_id == scan_id)
        query = query.where(Port.host_id.in_(host_ids))

    rows = session.exec(query).all()
    return [{"service": r.service, "count": r.count} for r in rows]
