"""
Scan diff engine — compares two completed scans and returns what changed.

Output shape:
    {
        "new_hosts":    ["1.2.3.4", ...],
        "removed_hosts": ["5.6.7.8", ...],
        "new_ports":    {"1.2.3.4": [22, 80], ...},
        "closed_ports": {"5.6.7.8": [443], ...},
        "summary": { ... }
    }
"""

from typing import Dict, List, Tuple

from sqlmodel import Session, select

from app.db.database import engine
from app.models.models import Host, Port, ScanDiffOut, DiffSummary


def _load_scan_map(scan_id: int, session: Session) -> Dict[str, List[int]]:
    """Return {ip: [open_ports]} for a given scan."""
    hosts = session.exec(select(Host).where(Host.scan_id == scan_id)).all()
    result: Dict[str, List[int]] = {}
    for host in hosts:
        open_ports = session.exec(
            select(Port.port).where(Port.host_id == host.id, Port.state == "open")
        ).all()
        result[host.ip] = list(open_ports)
    return result


def compare_scans(scan_id_a: int, scan_id_b: int) -> ScanDiffOut:
    with Session(engine) as session:
        map_a = _load_scan_map(scan_id_a, session)
        map_b = _load_scan_map(scan_id_b, session)

    ips_a = set(map_a.keys())
    ips_b = set(map_b.keys())

    new_hosts = list(ips_b - ips_a)
    removed_hosts = list(ips_a - ips_b)

    new_ports: Dict[str, List[int]] = {}
    closed_ports: Dict[str, List[int]] = {}

    for ip in ips_a & ips_b:
        ports_a = set(map_a[ip])
        ports_b = set(map_b[ip])

        added = sorted(ports_b - ports_a)
        closed = sorted(ports_a - ports_b)

        if added:
            new_ports[ip] = added
        if closed:
            closed_ports[ip] = closed

    summary = DiffSummary(
        new_hosts_count=len(new_hosts),
        removed_hosts_count=len(removed_hosts),
        changed_hosts_count=len(new_ports) + len(closed_ports),
        new_ports_total=sum(len(v) for v in new_ports.values()),
        closed_ports_total=sum(len(v) for v in closed_ports.values()),
    )

    return ScanDiffOut(
        scan_a=scan_id_a,
        scan_b=scan_id_b,
        new_hosts=new_hosts,
        removed_hosts=removed_hosts,
        new_ports=new_ports,
        closed_ports=closed_ports,
        summary=summary,
    )
