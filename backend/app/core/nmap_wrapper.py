"""
Optional Nmap wrapper — runs service/version detection on discovered hosts.

Used after masscan to fingerprint what's running on open ports.
Requires nmap to be installed and accessible in PATH.
"""

import asyncio
import xml.etree.ElementTree as ET
from typing import Dict, List, Optional

from app.config import settings


class NmapError(Exception):
    pass


class NmapWrapper:
    def __init__(self, nmap_path: str = None):
        self.nmap_path = nmap_path or settings.nmap_path

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def detect_services(
        self,
        ip: str,
        ports: List[int],
        timeout: int = 60,
    ) -> Dict[int, Dict]:
        """
        Run nmap -sV on a single IP for the given port list.

        Returns:
            {
                80:  {"service": "http",  "version": "nginx 1.24", "banner": "..."},
                443: {"service": "https", "version": "OpenSSL 3.0", "banner": ""},
            }
        """
        if not ports:
            return {}

        port_spec = ",".join(str(p) for p in ports)
        cmd = [
            self.nmap_path,
            "-sV",
            "--version-intensity", "5",
            "-p", port_spec,
            "-oX", "-",         # XML to stdout
            "--host-timeout", f"{timeout}s",
            ip,
        ]

        try:
            xml_output = await self._execute(cmd)
        except NmapError:
            return {}

        return self._parse_xml(xml_output)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _execute(self, cmd: List[str]) -> str:
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await process.communicate()
        except FileNotFoundError:
            raise NmapError(
                f"nmap not found at '{self.nmap_path}'. "
                "Install nmap and make sure it's in PATH."
            )

        if process.returncode != 0:
            raise NmapError(f"nmap error: {stderr.decode(errors='replace').strip()}")

        return stdout.decode(errors="replace")

    def _parse_xml(self, xml_output: str) -> Dict[int, Dict]:
        results: Dict[int, Dict] = {}
        try:
            root = ET.fromstring(xml_output)
        except ET.ParseError:
            return results

        for host in root.findall(".//host"):
            for port_el in host.findall(".//port"):
                portid = int(port_el.get("portid", 0))
                service_el = port_el.find("service")

                service_name: Optional[str] = None
                version_str: Optional[str] = None
                banner: Optional[str] = None

                if service_el is not None:
                    service_name = service_el.get("name")
                    parts = [
                        service_el.get("product", ""),
                        service_el.get("version", ""),
                        service_el.get("extrainfo", ""),
                    ]
                    version_str = " ".join(p for p in parts if p).strip() or None

                # Scripts (e.g. banner grab)
                for script in port_el.findall("script"):
                    if script.get("id") == "banner":
                        banner = script.get("output")
                        break

                results[portid] = {
                    "service": service_name,
                    "version": version_str,
                    "banner": banner,
                }

        return results
