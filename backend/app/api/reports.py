import csv
import io
import zipfile
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse
from sqlmodel import Session, select

from app.db.database import get_session
from app.models.models import Host, Port, Scan

router = APIRouter()


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _port_to_dict(p: Port) -> dict:
    return {
        "port": p.port,
        "protocol": p.protocol,
        "state": p.state,
        "service": p.service,
        "version": p.version,
        "banner": p.banner,
    }


def _build_report_data(scan_id: int, session: Session) -> dict:
    scan = session.get(Scan, scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    hosts = session.exec(select(Host).where(Host.scan_id == scan_id)).all()

    hosts_data = []
    all_ports = []

    for host in hosts:
        ports = session.exec(select(Port).where(Port.host_id == host.id)).all()
        ports_data = [_port_to_dict(p) for p in ports]
        hosts_data.append(
            {
                "ip": host.ip,
                "hostname": host.hostname,
                "os_guess": host.os_guess,
                "ports": ports_data,
            }
        )
        for p in ports:
            all_ports.append({"ip": host.ip, **_port_to_dict(p)})

    return {
        "scan": {
            "id": scan.id,
            "name": scan.name,
            "targets": scan.targets,
            "ports": scan.ports,
            "rate": scan.rate,
            "status": scan.status,
            "created_at": scan.created_at.isoformat() if scan.created_at else None,
            "completed_at": scan.completed_at.isoformat() if scan.completed_at else None,
            "hosts_count": scan.hosts_count,
            "ports_count": scan.ports_count,
            "nmap_enabled": scan.nmap_enabled,
        },
        "hosts": hosts_data,
        "_all_ports": all_ports,  # used internally for CSV / TXT
    }


def _build_txt_lines(data: dict, header: bool = True) -> list[str]:
    """Return lines for a proxy list: one `ip:port` per line."""
    lines = []
    scan = data["scan"]

    if header:
        date_str = scan["completed_at"] or scan["created_at"] or ""
        lines.append(f"# Scan #{scan['id']}: {scan['name'] or 'unnamed'} | {date_str[:10]} | {scan['hosts_count']} hosts | {scan['ports_count']} ports")

    for row in data["_all_ports"]:
        if row.get("port") is not None:
            lines.append(f"{row['ip']}:{row['port']}")

    return lines


def _safe_filename(scan: dict) -> str:
    name = (scan["name"] or f"scan{scan['id']}").replace(" ", "_")
    return f"scan_{scan['id']}_{name}"


# ──────────────────────────────────────────────────────────────────────────────
# Bulk export  — all completed scans  (defined BEFORE /{scan_id} to avoid clash)
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/all/txt")
def export_all_txt(session: Session = Depends(get_session)):
    """Combined proxy list for every completed scan."""
    scans = session.exec(
        select(Scan).where(Scan.status == "completed")
    ).all()

    if not scans:
        raise HTTPException(status_code=404, detail="No completed scans found")

    all_lines: list[str] = [
        "# Masscan Studio — Combined Proxy List",
        f"# Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC",
        f"# Scans included: {len(scans)}",
        "",
    ]

    for scan in scans:
        data = _build_report_data(scan.id, session)
        all_lines.extend(_build_txt_lines(data, header=True))
        all_lines.append("")   # blank line between scans

    content = "\n".join(all_lines)
    filename = f"masscan_all_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.txt"
    return StreamingResponse(
        iter([content]),
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/all/zip")
def export_all_zip(session: Session = Depends(get_session)):
    """ZIP archive with one TXT file per completed scan."""
    scans = session.exec(
        select(Scan).where(Scan.status == "completed")
    ).all()

    if not scans:
        raise HTTPException(status_code=404, detail="No completed scans found")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for scan in scans:
            data = _build_report_data(scan.id, session)
            lines = _build_txt_lines(data, header=True)
            fname = f"{_safe_filename(data['scan'])}.txt"
            zf.writestr(fname, "\n".join(lines))

    buf.seek(0)
    filename = f"masscan_all_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.zip"
    return StreamingResponse(
        iter([buf.read()]),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ──────────────────────────────────────────────────────────────────────────────
# Single-scan export  (after /all/* routes to avoid path param clash)
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/{scan_id}")
def export_report(
    scan_id: int,
    format: str = Query(default="json", pattern="^(json|csv|summary|txt)$"),
    session: Session = Depends(get_session),
):
    data = _build_report_data(scan_id, session)

    if format == "json":
        output = {k: v for k, v in data.items() if not k.startswith("_")}
        return JSONResponse(content=output)

    if format == "csv":
        return _export_csv(data)

    if format == "txt":
        return _export_txt(data)

    # summary (plain text)
    return _export_summary(data)


# ──────────────────────────────────────────────────────────────────────────────
# Format renderers
# ──────────────────────────────────────────────────────────────────────────────

def _export_txt(data: dict) -> StreamingResponse:
    lines = _build_txt_lines(data, header=True)
    content = "\n".join(lines)
    filename = f"{_safe_filename(data['scan'])}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.txt"
    return StreamingResponse(
        iter([content]),
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def _export_csv(data: dict) -> StreamingResponse:
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["ip", "port", "protocol", "state", "service", "version", "banner"],
    )
    writer.writeheader()
    for row in data["_all_ports"]:
        writer.writerow({k: (v or "") for k, v in row.items()})

    output.seek(0)
    filename = f"scan_{data['scan']['id']}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def _export_summary(data: dict) -> JSONResponse:
    scan = data["scan"]
    hosts = data["hosts"]

    lines = [
        "=" * 60,
        "MASSCAN STUDIO — SCAN REPORT",
        "=" * 60,
        f"Scan ID   : {scan['id']}",
        f"Name      : {scan['name'] or '—'}",
        f"Targets   : {scan['targets']}",
        f"Ports     : {scan['ports']}",
        f"Status    : {scan['status']}",
        f"Created   : {scan['created_at']}",
        f"Completed : {scan['completed_at']}",
        f"Hosts     : {scan['hosts_count']}",
        f"Open ports: {scan['ports_count']}",
        "",
        "DISCOVERED HOSTS",
        "-" * 60,
    ]

    for host in hosts:
        open_ports = [str(p["port"]) for p in host["ports"] if p["state"] == "open"]
        lines.append(f"  {host['ip']:<20} ports: {', '.join(open_ports) or '—'}")
        for p in host["ports"]:
            svc = f" ({p['service']} {p['version'] or ''})".strip() if p["service"] else ""
            lines.append(f"    └─ {p['port']}/{p['protocol']}{svc}")

    lines.append("=" * 60)
    return JSONResponse(content={"report": "\n".join(lines)})
