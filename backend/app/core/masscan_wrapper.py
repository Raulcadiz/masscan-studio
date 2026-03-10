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
import tempfile
from typing import Dict, List

from app.config import settings


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
    ) -> Dict[str, List[Dict]]:
        """
        Run masscan and return results organized by IP.

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
            await self._execute(cmd)
            raw = self._parse_output_file(output_file)
            return self._organize_by_ip(raw)
        finally:
            if os.path.exists(output_file):
                os.unlink(output_file)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_command(
        self, targets: str, ports: str, rate: int, output_file: str
    ) -> List[str]:
        return [
            self.masscan_path,
            targets,
            f"-p{ports}",
            f"--rate={rate}",
            "-oJ", output_file,
            "--wait=3",
        ]

    async def _execute(self, cmd: List[str]) -> None:
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await process.communicate()
        except FileNotFoundError:
            raise MasscanError(
                f"masscan not found at '{self.masscan_path}'. "
                "Install masscan and make sure it's in PATH."
            )

        if process.returncode not in (0, None):
            error_text = stderr.decode(errors="replace").strip()
            # masscan exits 1 on --wait timeout even with valid results
            if "FAIL" in error_text.upper() or not error_text:
                raise MasscanError(f"masscan exited with code {process.returncode}: {error_text}")

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
