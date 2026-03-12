"""
fingerprint.py — HTTP/TCP service fingerprinting with device classification.

Probe open ports and identify:
  📷 Cameras   (Hikvision, Dahua, Axis …)
  🖥️ Routers   (MikroTik, TP-Link, Cisco …)
  📹 DVR/NVR   (surveillance recorders)
  🌐 Web       (Apache, nginx, IIS …)
  🔀 Proxy     (Squid, Tinyproxy …)
  💾 NAS       (Synology, QNAP …)
  🖨️ Printer   (HP, Lexmark, Brother …)
  🔒 VPN       (Fortinet, Palo Alto …)
  📡 IoT       (embedded HTTP servers)
  🔑 SSH       (OpenSSH, Dropbear …)
  📁 FTP       (ProFTPD, FileZilla …)
  📧 SMTP      (Postfix, Exim …)
  💻 Telnet
"""
import asyncio
import json
import re
from typing import List, Optional

import httpx
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter()

# ---------------------------------------------------------------------------
# Fingerprint pattern database
# Order matters: more specific patterns come first.
# Each entry is matched against the combined lowercase text of:
#   Server header + HTML <title> + extra headers + raw TCP banner
# ---------------------------------------------------------------------------
_FINGERPRINTS = [
    # ── Cameras ──────────────────────────────────────────────────────────
    {"re": r"hikvision",                        "cat": "camera",  "label": "Hikvision Camera",    "icon": "📷"},
    {"re": r"dahua",                            "cat": "camera",  "label": "Dahua Camera",        "icon": "📷"},
    {"re": r"axis.*(?:camera|video|network)",   "cat": "camera",  "label": "Axis Camera",         "icon": "📷"},
    {"re": r"foscam",                           "cat": "camera",  "label": "Foscam Camera",       "icon": "📷"},
    {"re": r"amcrest",                          "cat": "camera",  "label": "Amcrest Camera",      "icon": "📷"},
    {"re": r"vivotek",                          "cat": "camera",  "label": "Vivotek Camera",      "icon": "📷"},
    {"re": r"hanwha|samsung.*security",         "cat": "camera",  "label": "Hanwha/Samsung Cam",  "icon": "📷"},
    {"re": r"avigilon",                         "cat": "camera",  "label": "Avigilon Camera",     "icon": "📷"},
    {"re": r"reolink",                          "cat": "camera",  "label": "Reolink Camera",      "icon": "📷"},
    {"re": r"ip[\s_-]?cam(?:era)?|netcam|ipcamera", "cat": "camera", "label": "IP Camera",       "icon": "📷"},
    # ── DVR / NVR ─────────────────────────────────────────────────────────
    {"re": r"h\.?264 dvr|network dvr|web dvr",  "cat": "dvr",     "label": "H.264 DVR",           "icon": "📹"},
    {"re": r"\bdvr\b|\bnvr\b",                  "cat": "dvr",     "label": "DVR/NVR",             "icon": "📹"},
    # ── Routers ───────────────────────────────────────────────────────────
    {"re": r"mikrotik|routeros",                "cat": "router",  "label": "MikroTik",            "icon": "🖥️"},
    {"re": r"tp[\s-]?link",                     "cat": "router",  "label": "TP-Link",             "icon": "🖥️"},
    {"re": r"\bd[\s-]?link\b",                  "cat": "router",  "label": "D-Link",              "icon": "🖥️"},
    {"re": r"netgear",                          "cat": "router",  "label": "Netgear",             "icon": "🖥️"},
    {"re": r"linksys",                          "cat": "router",  "label": "Linksys",             "icon": "🖥️"},
    {"re": r"asus.*(router|wireless|wrt|rt-\w)", "cat": "router", "label": "ASUS Router",         "icon": "🖥️"},
    {"re": r"\bcisco\b",                        "cat": "router",  "label": "Cisco",               "icon": "🖥️"},
    {"re": r"ubiquiti|unifi|edgerouter|edgemax", "cat": "router", "label": "Ubiquiti",            "icon": "🖥️"},
    {"re": r"juniper.*(?:router|switch|srx|mx)", "cat": "router", "label": "Juniper",             "icon": "🖥️"},
    {"re": r"zyxel",                            "cat": "router",  "label": "ZyXEL",               "icon": "🖥️"},
    {"re": r"huawei.*(?:router|hg\d|ar\d)",     "cat": "router",  "label": "Huawei Router",       "icon": "🖥️"},
    {"re": r"draytek",                          "cat": "router",  "label": "DrayTek",             "icon": "🖥️"},
    {"re": r"openwrt|dd-wrt|tomato firmware",   "cat": "router",  "label": "Custom Router FW",    "icon": "🖥️"},
    # ── NAS ───────────────────────────────────────────────────────────────
    {"re": r"synology",                         "cat": "nas",     "label": "Synology NAS",        "icon": "💾"},
    {"re": r"\bqnap\b",                         "cat": "nas",     "label": "QNAP NAS",            "icon": "💾"},
    {"re": r"freenas|truenas",                  "cat": "nas",     "label": "TrueNAS",             "icon": "💾"},
    {"re": r"wd.*(?:mycloud|nas)|my.?cloud",    "cat": "nas",     "label": "WD NAS",              "icon": "💾"},
    {"re": r"readynas",                         "cat": "nas",     "label": "ReadyNAS",            "icon": "💾"},
    # ── Printers ──────────────────────────────────────────────────────────
    {"re": r"jetdirect|hp.*laserjet|hp.*officejet|hp.*printer", "cat": "printer", "label": "HP Printer", "icon": "🖨️"},
    {"re": r"lexmark",                          "cat": "printer", "label": "Lexmark Printer",     "icon": "🖨️"},
    {"re": r"brother.*(?:http|printer|mfc|dcp)", "cat": "printer", "label": "Brother Printer",   "icon": "🖨️"},
    {"re": r"ricoh",                            "cat": "printer", "label": "Ricoh Printer",       "icon": "🖨️"},
    {"re": r"kyocera",                          "cat": "printer", "label": "Kyocera Printer",     "icon": "🖨️"},
    {"re": r"xerox",                            "cat": "printer", "label": "Xerox Printer",       "icon": "🖨️"},
    {"re": r"epson.*(?:printer|http|net)",      "cat": "printer", "label": "Epson Printer",       "icon": "🖨️"},
    {"re": r"canon.*(?:printer|http)",          "cat": "printer", "label": "Canon Printer",       "icon": "🖨️"},
    {"re": r"print.?server|printer",            "cat": "printer", "label": "Printer",             "icon": "🖨️"},
    # ── Proxy ─────────────────────────────────────────────────────────────
    {"re": r"squid(?:/[\d.]+)?",                "cat": "proxy",   "label": "Squid Proxy",         "icon": "🔀"},
    {"re": r"tinyproxy",                        "cat": "proxy",   "label": "Tinyproxy",           "icon": "🔀"},
    {"re": r"ccproxy",                          "cat": "proxy",   "label": "CCProxy",             "icon": "🔀"},
    {"re": r"via:.*proxy|proxy-connection",     "cat": "proxy",   "label": "HTTP Proxy",          "icon": "🔀"},
    # ── VPN ───────────────────────────────────────────────────────────────
    {"re": r"fortinet|fortigate|fortissl",      "cat": "vpn",     "label": "Fortinet VPN",        "icon": "🔒"},
    {"re": r"palo.?alto",                       "cat": "vpn",     "label": "Palo Alto VPN",       "icon": "🔒"},
    {"re": r"pulse.?secure|junos pulse",        "cat": "vpn",     "label": "Pulse Secure VPN",    "icon": "🔒"},
    {"re": r"sonicwall",                        "cat": "vpn",     "label": "SonicWall VPN",       "icon": "🔒"},
    {"re": r"checkpoint|check.point",           "cat": "vpn",     "label": "Check Point VPN",     "icon": "🔒"},
    {"re": r"openvpn|openconnect",              "cat": "vpn",     "label": "VPN",                 "icon": "🔒"},
    # ── Web Servers ───────────────────────────────────────────────────────
    {"re": r"apache(?:/[\d.]+)?",               "cat": "web",     "label": "Apache",              "icon": "🌐"},
    {"re": r"nginx(?:/[\d.]+)?",                "cat": "web",     "label": "nginx",               "icon": "🌐"},
    {"re": r"microsoft-iis(?:/[\d.]+)?",        "cat": "web",     "label": "Microsoft IIS",       "icon": "🌐"},
    {"re": r"lighttpd",                         "cat": "web",     "label": "Lighttpd",            "icon": "🌐"},
    {"re": r"openresty",                        "cat": "web",     "label": "OpenResty",           "icon": "🌐"},
    {"re": r"\bcaddy\b",                        "cat": "web",     "label": "Caddy",               "icon": "🌐"},
    {"re": r"gunicorn|uwsgi",                   "cat": "web",     "label": "Python Web Server",   "icon": "🌐"},
    {"re": r"tornado",                          "cat": "web",     "label": "Tornado",             "icon": "🌐"},
    # ── Embedded / IoT ────────────────────────────────────────────────────
    {"re": r"mini_httpd|thttpd|boa(?:/[\d.]+)?","cat": "iot",     "label": "Embedded HTTP",       "icon": "📡"},
    {"re": r"goahead",                          "cat": "iot",     "label": "GoAhead HTTP",        "icon": "📡"},
    {"re": r"allegro|rompager",                 "cat": "iot",     "label": "Router HTTP",         "icon": "📡"},
    # ── SSH ───────────────────────────────────────────────────────────────
    {"re": r"ssh-[\d.]",                        "cat": "ssh",     "label": "SSH Server",          "icon": "🔑"},
    {"re": r"openssh",                          "cat": "ssh",     "label": "OpenSSH",             "icon": "🔑"},
    {"re": r"dropbear",                         "cat": "ssh",     "label": "Dropbear SSH",        "icon": "🔑"},
    # ── FTP ───────────────────────────────────────────────────────────────
    {"re": r"proftpd|pureftpd|filezilla.*server","cat": "ftp",    "label": "FTP Server",          "icon": "📁"},
    {"re": r"^220\s.*(?:ftp|ready)",            "cat": "ftp",     "label": "FTP Server",          "icon": "📁"},
    {"re": r"vsftpd",                           "cat": "ftp",     "label": "vsftpd",              "icon": "📁"},
    # ── SMTP ──────────────────────────────────────────────────────────────
    {"re": r"postfix|sendmail|exim|qmail",      "cat": "smtp",    "label": "Mail Server",         "icon": "📧"},
    {"re": r"^220\s.*(?:smtp|mail|esmtp)",      "cat": "smtp",    "label": "Mail Server",         "icon": "📧"},
    # ── Telnet ────────────────────────────────────────────────────────────
    {"re": r"\xff[\xfd\xfb]",                   "cat": "telnet",  "label": "Telnet",              "icon": "💻"},
    {"re": r"telnet",                           "cat": "telnet",  "label": "Telnet",              "icon": "💻"},
]

# Compiled once at import time for performance
_COMPILED = [(re.compile(fp["re"], re.IGNORECASE), fp) for fp in _FINGERPRINTS]

# Ports where we try HTTPS before HTTP
_HTTPS_FIRST = {443, 8443, 4443, 10443}
# Ports that are never HTTP — go straight to TCP banner
_TCP_ONLY = {21, 22, 23, 25, 110, 143, 465, 587, 993, 995, 3306, 5432, 6379, 27017}


# ---------------------------------------------------------------------------
# Classify
# ---------------------------------------------------------------------------

def _classify(text: str) -> dict:
    """Return {category, label, icon} for the first matching fingerprint."""
    for pattern, fp in _COMPILED:
        if pattern.search(text):
            return {"category": fp["cat"], "label": fp["label"], "icon": fp["icon"]}
    return {"category": "unknown", "label": "Unknown Service", "icon": "❓"}


# ---------------------------------------------------------------------------
# Probes
# ---------------------------------------------------------------------------

async def _http_grab(ip: str, port: int, ssl: bool, timeout: float) -> Optional[dict]:
    scheme = "https" if ssl else "http"
    url = f"{scheme}://{ip}:{port}/"
    try:
        async with httpx.AsyncClient(
            verify=False,
            timeout=timeout,
            follow_redirects=True,
        ) as client:
            r = await client.get(
                url,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
            )
            title_m = re.search(r"<title[^>]*>(.*?)</title>", r.text, re.IGNORECASE | re.DOTALL)
            title = re.sub(r"\s+", " ", title_m.group(1)).strip()[:200] if title_m else None
            extra = " ".join(filter(None, [
                r.headers.get("x-powered-by", ""),
                r.headers.get("www-authenticate", ""),
                r.headers.get("x-generator", ""),
                r.headers.get("via", ""),
            ]))
            return {
                "status_code": r.status_code,
                "server": r.headers.get("server") or None,
                "title": title,
                "ssl": ssl,
                "extra": extra,
            }
    except Exception:
        return None


async def _tcp_banner(ip: str, port: int, timeout: float) -> Optional[str]:
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(ip, port), timeout=timeout
        )
        try:
            data = await asyncio.wait_for(reader.read(1024), timeout=min(timeout, 2.0))
            if data:
                writer.close()
                try:
                    await writer.wait_closed()
                except Exception:
                    pass
                return data.decode("utf-8", errors="replace").strip()
        except asyncio.TimeoutError:
            pass
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Main fingerprinter
# ---------------------------------------------------------------------------

async def _fingerprint_one(ip: str, port: int, timeout: float) -> dict:
    result: dict = {
        "ip":          ip,
        "port":        port,
        "service":     None,
        "server":      None,
        "title":       None,
        "banner":      None,
        "status_code": None,
        "ssl":         False,
        "category":    None,
        "label":       None,
        "icon":        None,
    }

    fp_text = ""   # combined text for pattern matching

    if port in _TCP_ONLY:
        # ── Pure TCP services ────────────────────────────────────────────
        banner = await _tcp_banner(ip, port, timeout)
        if banner:
            result["banner"] = banner[:300]
            fp_text = banner.lower()
        # Annotate well-known ports even without a banner
        if port == 22:
            result["service"] = "ssh"
        elif port == 21:
            result["service"] = "ftp"
        elif port == 23:
            result["service"] = "telnet"
        elif port in (25, 465, 587):
            result["service"] = "smtp"
        elif port in (110, 995):
            result["service"] = "pop3"
        elif port in (143, 993):
            result["service"] = "imap"
        elif port == 3306:
            result["service"] = "mysql"
        elif port == 5432:
            result["service"] = "postgresql"
        elif port == 6379:
            result["service"] = "redis"
        elif port == 27017:
            result["service"] = "mongodb"

    else:
        # ── HTTP / HTTPS probes ───────────────────────────────────────────
        https_first = port in _HTTPS_FIRST
        probes = [(True, False), (False, True)] if not https_first else [(False, True), (True, False)]
        # probes: (try_http, try_https)

        http_data  = None
        https_data = None

        for try_http, try_https in probes:
            if try_http and http_data is None:
                http_data = await _http_grab(ip, port, ssl=False, timeout=timeout)
            if try_https and https_data is None:
                https_data = await _http_grab(ip, port, ssl=True, timeout=timeout)
            if http_data or https_data:
                break

        best = https_data or http_data
        if best:
            result["status_code"] = best["status_code"]
            result["server"]      = best["server"]
            result["title"]       = best["title"]
            result["ssl"]         = best["ssl"]
            result["service"]     = "https" if best["ssl"] else "http"
            fp_text = " ".join(filter(None, [
                best.get("server", "") or "",
                best.get("title", "") or "",
                best.get("extra", "") or "",
            ])).lower()

        # Fallback: raw TCP banner
        if not fp_text.strip():
            banner = await _tcp_banner(ip, port, timeout)
            if banner:
                result["banner"] = banner[:300]
                fp_text = banner.lower()

    # ── Classify ─────────────────────────────────────────────────────────
    if fp_text.strip():
        result.update(_classify(fp_text))

    return result


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

class FingerprintRequest(BaseModel):
    targets:     List[str]   # ["ip:port", ...]
    timeout:     float = 5.0
    concurrency: int   = 50


# ---------------------------------------------------------------------------
# SSE streaming endpoint
# ---------------------------------------------------------------------------

_SSE_HEADERS = {
    "Cache-Control":     "no-cache",
    "X-Accel-Buffering": "no",
    "Connection":        "keep-alive",
}


def _parse_target(raw: str):
    """Return (ip, port) or None if unparseable."""
    raw = raw.strip()
    if not raw:
        return None
    parts = raw.rsplit(":", 1)
    if len(parts) != 2:
        return None
    ip = parts[0].strip("[] ")   # handle IPv6 [::1]
    try:
        port = int(parts[1])
    except ValueError:
        return None
    if not ip or not (1 <= port <= 65535):
        return None
    return ip, port


@router.post("/scan")
async def fingerprint_scan(payload: FingerprintRequest):
    """
    Fingerprint a list of ip:port targets and stream results via SSE.

    Events:
      {"type":"result", ip, port, service, server, title, banner, status_code,
                        ssl, category, label, icon}
      {"type":"done",   total}
    """
    targets = [_parse_target(t) for t in payload.targets]
    targets = [t for t in targets if t is not None]

    async def generate():
        if not targets:
            yield f"data: {json.dumps({'type': 'done', 'total': 0})}\n\n"
            return

        sem   = asyncio.Semaphore(min(payload.concurrency, 200))
        queue: asyncio.Queue = asyncio.Queue()

        async def _run(ip: str, port: int):
            async with sem:
                result = await _fingerprint_one(ip, port, payload.timeout)
                await queue.put(result)

        tasks = [asyncio.create_task(_run(ip, port)) for ip, port in targets]

        for _ in range(len(targets)):
            result = await queue.get()
            yield f"data: {json.dumps({'type': 'result', **result})}\n\n"

        yield f"data: {json.dumps({'type': 'done', 'total': len(targets)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream", headers=_SSE_HEADERS)
