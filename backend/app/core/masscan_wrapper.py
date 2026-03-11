"""
Masscan wrapper — executes masscan and parses its JSON output.

Masscan JSON output quirk: it writes almost-valid JSON. The file starts with
'[\n' and each entry is '{ ... },\n', including a trailing comma on the last
entry before the closing ']'. We fix that before parsing.
"""

import asyncio
import json
import os
import re
import subprocess
import tempfile
import threading
import time
from typing import Callable, Dict, List, Optional

from app.config import settings


# ── Process registry (module-level so stop endpoint can reach it) ─────────────
_active_procs: Dict[int, subprocess.Popen] = {}   # scan_id → process
_stopped_scans: set = set()                        # scan_ids killed by user


class MasscanError(Exception):
    pass


class MasscanWrapper:
    def __init__(self, masscan_path: str = None):
        self.masscan_path = masscan_path or settings.masscan_path

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def run_scan(
        self,
        targets: str,
        ports: str,
        rate: int = 1000,
        progress_cb: Optional[Callable[[Dict[str, List[Dict]]], None]] = None,
        scan_id: Optional[int] = None,
    ) -> Dict[str, List[Dict]]:
        """
        Run masscan and return results organized by IP.

        If `progress_cb` is provided it will be called every ~30 s with
        a dict of *newly-discovered* hosts (same format as the return value).
        This allows the caller to persist partial results to the DB while
        masscan is still running.

        Returns:
            {
                "192.168.1.1": [
                    {"port": 80, "protocol": "tcp", "state": "open", "reason": "syn-ack"},
                    ...
                ],
                ...
            }
        """
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
            output_file = f.name

        try:
            cmd = self._build_command(targets, ports, rate, output_file)
            await asyncio.to_thread(
                self._execute_sync, cmd, output_file, progress_cb, scan_id
            )
            raw = self._parse_output_file(output_file)
            return self._organize_by_ip(raw)
        finally:
            if os.path.exists(output_file):
                os.unlink(output_file)

    @staticmethod
    def kill_scan(scan_id: int) -> bool:
        """
        Send SIGTERM to the running masscan process for this scan.
        Partial results already saved via progress_cb will be preserved.
        Returns True if a process was found and signalled.
        """
        _stopped_scans.add(scan_id)
        proc = _active_procs.pop(scan_id, None)
        if proc and proc.poll() is None:
            proc.terminate()
            return True
        return False

    @staticmethod
    def was_stopped(scan_id: int) -> bool:
        """Check (and clear) whether this scan was user-stopped."""
        return _stopped_scans.discard(scan_id) is not None or scan_id not in _stopped_scans

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_command(
        self, targets: str, ports: str, rate: int, output_file: str
    ) -> List[str]:
        # Split targets on commas or whitespace so multiple CIDRs become separate args
        target_list = [t for t in re.split(r"[,\s]+", targets) if t]
        return [
            self.masscan_path,
            *target_list,
            f"-p{ports}",
            f"--rate={rate}",
            "--exclude", "255.255.255.255",   # required by masscan for large ranges
            "-oJ", output_file,
            "--wait=3",
        ]

    def _execute_sync(
        self,
        cmd: List[str],
        output_file: str,
        progress_cb: Optional[Callable] = None,
        scan_id: Optional[int] = None,
        poll_interval: int = 30,
    ) -> None:
        """
        Run masscan via Popen.  If progress_cb is given, a daemon thread
        reads the (still-being-written) output file every `poll_interval`
        seconds and calls progress_cb({new_ip: [ports]}) with newly found
        hosts since the last check.
        """
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
        except FileNotFoundError:
            raise MasscanError(
                f"masscan not found at '{self.masscan_path}'. "
                "Install masscan and make sure it's in PATH."
            )

        if scan_id is not None:
            _active_procs[scan_id] = proc

        if progress_cb is not None:
            known_ips: set = set()

            def _monitor() -> None:
                while proc.poll() is None:
                    time.sleep(poll_interval)
                    raw = self._parse_ndjson(output_file)       # safe for partial files
                    organized = self._organize_by_ip(raw)
                    new = {ip: p for ip, p in organized.items()
                           if ip not in known_ips}
                    if new:
                        known_ips.update(new)
                        try:
                            progress_cb(new)
                        except Exception:
                            pass  # never crash the monitor thread

            threading.Thread(target=_monitor, daemon=True).start()

        proc.wait()
        _active_procs.pop(scan_id, None)

        if proc.returncode not in (0, None):
            # If user triggered a stop, swallow the error — partial results are fine
            if scan_id is not None and scan_id in _stopped_scans:
                return   # caller will detect via was_stopped()

            stderr = proc.stderr.read().decode(errors="replace").strip()
            if "FAIL" in stderr.upper() or not stderr:
                raise MasscanError(
                    f"masscan exited with code {proc.returncode}: {stderr}"
                )

    def _parse_output_file(self, filepath: str) -> List[Dict]:
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read().strip()
        except FileNotFoundError:
            return []

        if not content or content in ("[]", "[", "]"):
            return []

        # Fix trailing comma before closing bracket: [...},\n]  →  [...}]
        content = re.sub(r",\s*\]", "]", content)

        if not content.startswith("["):
            content = "[" + content + "]"

        try:
            return json.loads(content)
        except json.JSONDecodeError:
            return self._parse_ndjson(filepath)

    def _parse_ndjson(self, filepath: str) -> List[Dict]:
        """Fallback: parse line-by-line (NDJSON)."""
        results = []
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip().rstrip(",")
                    if line.startswith("{"):
                        try:
                            results.append(json.loads(line))
                        except json.JSONDecodeError:
                            pass
        except FileNotFoundError:
            pass
        return results

    def _organize_by_ip(self, raw: List[Dict]) -> Dict[str, List[Dict]]:
        """
        Masscan can emit multiple entries for the same IP (one per port).
        Merge them into {ip: [port_info, ...]}.
        """
        hosts: Dict[str, List[Dict]] = {}
        for entry in raw:
            ip = entry.get("ip")
            if not ip:
                continue
            if ip not in hosts:
                hosts[ip] = []
            for p in entry.get("ports", []):
                hosts[ip].append(
                    {
                        "port": p.get("port"),
                        "protocol": p.get("proto", "tcp"),
                        "state": p.get("status", "open"),
                        "reason": p.get("reason", ""),
                        "ttl": p.get("ttl", 0),
                    }
                )
        return hosts
