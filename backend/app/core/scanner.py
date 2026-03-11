"""
ScanOrchestrator — coordinates the full scan pipeline:

    masscan  →  save to DB (incrementally every ~30 s)
             →  (optional) nmap enrichment on all hosts  →  update DB
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

            targets = scan.targets
            ports = scan.ports
            rate = scan.rate
            nmap_enabled = scan.nmap_enabled

        # Shared state for the incremental callback (called from a thread)
        seen_ips: set = set()
        counters = {"hosts": 0, "ports": 0}

        def on_partial(new_hosts: dict) -> None:
            """Called by the masscan monitor thread every ~30 s."""
            h, p = self._save_hosts_sync(scan_id, new_hosts)
            counters["hosts"] += h
            counters["ports"] += p
            seen_ips.update(new_hosts)
            self._update_counts(scan_id, counters["hosts"], counters["ports"])

        try:
            # Run masscan — partial results are saved via on_partial
            hosts_data = await self.masscan.run_scan(
                targets=targets,
                ports=ports,
                rate=rate,
                progress_cb=on_partial,
            )

            # Save any hosts discovered in the final parse that weren't in a partial flush
            final_new = {ip: p for ip, p in hosts_data.items() if ip not in seen_ips}
            if final_new:
                h, p = self._save_hosts_sync(scan_id, final_new)
                counters["hosts"] += h
                counters["ports"] += p

            # Optionally enrich with nmap (runs after all masscan results are saved)
            if nmap_enabled:
                await self._enrich_with_nmap(scan_id)

            self._update_counts(scan_id, counters["hosts"], counters["ports"])
            self._mark_scan_status(scan_id, "completed")

        except MasscanError as e:
            self._mark_scan_status(scan_id, "failed", str(e))
        except Exception as e:
            self._mark_scan_status(scan_id, "failed", f"Unexpected error: {e}")

    # ------------------------------------------------------------------
    # DB helpers
    # ------------------------------------------------------------------

    def _save_hosts_sync(self, scan_id: int, hosts_data: dict) -> tuple[int, int]:
        """
        Save a batch of hosts+ports to the DB synchronously.
        Returns (new_hosts_count, new_ports_count).
        """
        new_hosts = 0
        new_ports = 0

        with Session(engine) as session:
            for ip, port_list in hosts_data.items():
                host = Host(scan_id=scan_id, ip=ip)
                session.add(host)
                session.flush()

                for p in port_list:
                    port_num = p.get("port")
                    if port_num is None:
                        continue
                    port_row = Port(
                        host_id=host.id,
                        port=port_num,
                        protocol=p.get("protocol", "tcp"),
                        state=p.get("state", "open"),
                        reason=p.get("reason"),
                    )
                    session.add(port_row)
                    new_ports += 1

                new_hosts += 1
            session.commit()

        return new_hosts, new_ports

    async def _enrich_with_nmap(self, scan_id: int) -> None:
        """Run nmap -sV on every host saved for this scan and update service info."""
        with Session(engine) as session:
            hosts = session.exec(
                select(Host).where(Host.scan_id == scan_id)
            ).all()

        for host in hosts:
            with Session(engine) as session:
                ports = session.exec(
                    select(Port).where(Port.host_id == host.id)
                ).all()
                port_numbers = [p.port for p in ports if p.port is not None]

            if not port_numbers:
                continue

            nmap_info = await self.nmap.detect_services(host.ip, port_numbers)
            if not nmap_info:
                continue

            with Session(engine) as session:
                ports = session.exec(
                    select(Port).where(Port.host_id == host.id)
                ).all()
                for port_row in ports:
                    enriched = nmap_info.get(port_row.port, {})
                    if enriched:
                        port_row.service = enriched.get("service")
                        port_row.version = enriched.get("version")
                        port_row.banner  = enriched.get("banner")
                        session.add(port_row)
                session.commit()

    def _update_counts(self, scan_id: int, hosts: int, ports: int) -> None:
        with Session(engine) as session:
            scan = session.get(Scan, scan_id)
            if scan:
                scan.hosts_count = hosts
                scan.ports_count = ports
                session.add(scan)
                session.commit()

    def _mark_scan_status(
        self, scan_id: int, status: str, error: Optional[str] = None
    ) -> None:
        with Session(engine) as session:
            scan = session.get(Scan, scan_id)
            if scan:
                scan.status = status
                scan.completed_at = datetime.utcnow()
                if error is not None:
                    scan.error_message = error
                session.add(scan)
                session.commit()
