from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select
from typing import List, Optional

from app.db.database import get_session
from app.models.models import Host, HostOut, Port, PortOut

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
        ports = session.exec(select(Port).where(Port.host_id == host.id)).all()

        # Apply port filter
        if port and not any(p.port == port for p in ports):
            continue

        result.append(
            HostOut(
                id=host.id,
                ip=host.ip,
                hostname=host.hostname,
                os_guess=host.os_guess,
                ports=[PortOut.model_validate(p) for p in ports],
            )
        )
    return result


@router.get("/{host_id}", response_model=HostOut)
def get_host(host_id: int, session: Session = Depends(get_session)):
    host = session.get(Host, host_id)
    if not host:
        raise HTTPException(status_code=404, detail="Host not found")

    ports = session.exec(select(Port).where(Port.host_id == host.id)).all()
    return HostOut(
        id=host.id,
        ip=host.ip,
        hostname=host.hostname,
        os_guess=host.os_guess,
        ports=[PortOut.model_validate(p) for p in ports],
    )
