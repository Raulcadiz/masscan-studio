"""
ScanOrchestrator — coordinates the full scan pipeline:

    masscan  →  save to DB  →  (optional) nmap  →  update DB
"""

from datetime import datetime
from typing import Optional

from sqlmodel import Session, select

from app.core.masscan_wrapper import MasscanWrapper, MasscanError
from app.core.nmap_wrapper import NmapWrapper
from app.db.database import engine
from app.models.models import Host, Port, Scan


class ScanOrchestrator:
    def __init__(self):
        self.masscan = MasscanWrapper()
        self.nmap = NmapWrapper()

    # ------------------------------------------------------------------
    # Entry point (runs in background task)
    # ------------------------------------------------------------------

    async def run(self, scan_id: int) -> None:
        with Session(engine) as session:
            scan = session.get(Scan, scan_id)
            if not scan:
                return

            scan.status = "running"
            scan.started_at = datetime.utcnow()
            session.add(scan)
            session.commit()

        try:
            hosts_data = await self.masscan.run_scan(
                targets=scan.targets,
                ports=scan.ports,
                rate=scan.rate,
            )
            await self._save_results(scan_id, hosts_data, scan.nmap_enabled)
            self._mark_completed(scan_id)

        except MasscanError as e:
            self._mark_failed(scan_id, str(e))
        except Exception as e:
            self._mark_failed(scan_id, f"Unexpected error: {e}")

    # ------------------------------------------------------------------
    # DB helpers
    # ------------------------------------------------------------------

    async def _save_results(
        self,
        scan_id: int,
        hosts_data: dict,
        nmap_enabled: bool,
    ) -> None:
        total_ports = 0

        with Session(engine) as session:
            for ip, port_list in hosts_data.items():
                host = Host(scan_id=scan_id, ip=ip)
                session.add(host)
                session.flush()  # get host.id

                # Optionally enrich with nmap
                nmap_info: dict = {}
                if nmap_enabled and port_list:
                    port_numbers = [p["port"] for p in port_list if p.get("port")]
                    nmap_info = await self.nmap.detect_services(ip, port_numbers)

                for p in port_list:
                    port_num = p.get("port")
                    if port_num is None:
                        continue

                    enriched = nmap_info.get(port_num, {})
                    port_row = Port(
                        host_id=host.id,
                        port=port_num,
                        protocol=p.get("protocol", "tcp"),
                        state=p.get("state", "open"),
                        reason=p.get("reason"),
                        service=enriched.get("service"),
                        version=enriched.get("version"),
                        banner=enriched.get("banner"),
                    )
                    session.add(port_row)
                    total_ports += 1

            # Update scan counters
            scan = session.get(Scan, scan_id)
            if scan:
                scan.hosts_count = len(hosts_data)
                scan.ports_count = total_ports
                session.add(scan)

            session.commit()

    def _mark_completed(self, scan_id: int) -> None:
        with Session(engine) as session:
            scan = session.get(Scan, scan_id)
            if scan:
                scan.status = "completed"
                scan.completed_at = datetime.utcnow()
                session.add(scan)
                session.commit()

    def _mark_failed(self, scan_id: int, error: str) -> None:
        with Session(engine) as session:
            scan = session.get(Scan, scan_id)
            if scan:
                scan.status = "failed"
                scan.completed_at = datetime.utcnow()
                scan.error_message = error
                session.add(scan)
                session.commit()
