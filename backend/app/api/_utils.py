"""Shared utilities for API route handlers."""

from sqlmodel import Session, select

from app.models.models import Host, HostOut, Port, PortOut


def build_host_out(host: Host, session: Session) -> HostOut:
    """Load ports for a host and return a populated HostOut."""
    ports = session.exec(select(Port).where(Port.host_id == host.id)).all()
    return HostOut(
        id=host.id,
        ip=host.ip,
        hostname=host.hostname,
        os_guess=host.os_guess,
        ports=[PortOut.model_validate(p) for p in ports],
    )


def load_hosts_with_ports(scan_id: int, session: Session) -> list[HostOut]:
    """Return all HostOut objects for a scan, each with their ports loaded."""
    hosts = session.exec(select(Host).where(Host.scan_id == scan_id)).all()
    return [build_host_out(host, session) for host in hosts]
