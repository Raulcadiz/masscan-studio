from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select
from typing import List, Optional

from app.db.database import get_session
from app.models.models import Host, HostOut, Port
from app.api._utils import build_host_out

router = APIRouter()


@router.get("/", response_model=List[HostOut])
def list_hosts(
    scan_id: Optional[int] = None,
    ip: Optional[str] = None,
    port: Optional[int] = Query(default=None, description="Filter hosts that have this port open"),
    session: Session = Depends(get_session),
):
    query = select(Host)

    if scan_id:
        query = query.where(Host.scan_id == scan_id)
    if ip:
        query = query.where(Host.ip.contains(ip))

    hosts = session.exec(query).all()

    result = []
    for host in hosts:
        host_out = build_host_out(host, session)

        # Apply port filter after loading (port list already fetched)
        if port and not any(p.port == port for p in host_out.ports):
            continue

        result.append(host_out)
    return result


@router.get("/{host_id}", response_model=HostOut)
def get_host(host_id: int, session: Session = Depends(get_session)):
    host = session.get(Host, host_id)
    if not host:
        raise HTTPException(status_code=404, detail="Host not found")
    return build_host_out(host, session)
