import asyncio
import time
from typing import List, Optional
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


# ---------------------------------------------------------------------------
# IP / proxy helpers
# ---------------------------------------------------------------------------

def _extract_ip(raw: str) -> Optional[str]:
    """Extract the bare IP address from any proxy string format."""
    raw = raw.strip()
    if not raw:
        return None
    if "://" in raw:
        try:
            return urlparse(raw).hostname
        except Exception:
            return None
    return raw.split(":")[0] or None


def _build_proxy_url(raw: str) -> Optional[str]:
    """
    Normalize a proxy string to a full URL httpx understands.
    Formats accepted:
      ip:port
      ip:port:user:pass
      protocol://ip:port
      protocol://user:pass@ip:port
    """
    raw = raw.strip()
    if not raw:
        return None
    if "://" in raw:
        return raw
    parts = raw.split(":")
    if len(parts) == 2:
        return f"http://{raw}"
    if len(parts) == 4:
        ip, port, user, password = parts
        return f"http://{user}:{password}@{ip}:{port}"
    return None


def _country_flag(code: str) -> str:
    """Convert ISO-3166-1 alpha-2 code to emoji flag."""
    if not code or len(code) != 2:
        return ""
    try:
        return chr(0x1F1E0 + ord(code[0].upper()) - ord("A")) + \
               chr(0x1F1E0 + ord(code[1].upper()) - ord("A"))
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# GeoIP via ip-api.com (free, no key needed, 100 IPs per batch)
# ---------------------------------------------------------------------------

async def _lookup_countries(ips: list) -> dict:
    """
    Returns {ip: {"country": "Spain", "country_code": "ES", "flag": "ES flag emoji"}}.
    Runs concurrently with proxy checking — failures are silently ignored.
    """
    unique = [ip for ip in set(ips) if ip]
    if not unique:
        return {}

    result = {}
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            for i in range(0, len(unique), 100):
                batch = unique[i : i + 100]
                try:
                    r = await client.post(
                        "http://ip-api.com/batch?fields=query,countryCode,country",
                        json=[{"query": ip} for ip in batch],
                    )
                    if r.status_code == 200:
                        for item in r.json():
                            code = item.get("countryCode", "")
                            result[item["query"]] = {
                                "country": item.get("country", ""),
                                "country_code": code,
                                "flag": _country_flag(code),
                            }
                    # Respect free-tier rate limit between batches
                    if i + 100 < len(unique):
                        await asyncio.sleep(1.5)
                except Exception:
                    pass
    except Exception:
        pass

    return result


# ---------------------------------------------------------------------------
# Single-proxy checker
# ---------------------------------------------------------------------------

async def _check_one(proxy_raw: str, test_url: str, timeout: int) -> dict:
    proxy_url = _build_proxy_url(proxy_raw)
    if not proxy_url:
        return {
            "proxy": proxy_raw,
            "alive": False,
            "response_time": None,
            "status_code": None,
            "error": "Invalid format",
            "country": "",
            "country_code": "",
            "flag": "",
        }

    err = None
    try:
        # proxies= routes ALL traffic (HTTP + HTTPS/CONNECT) through the proxy.
        # The old transport= approach bypassed HTTPS, causing false-positives.
        async with httpx.AsyncClient(
            proxies=proxy_url,
            timeout=timeout,
            follow_redirects=True,
            verify=False,
        ) as client:
            t0 = time.monotonic()
            r = await client.get(test_url)
            elapsed = round((time.monotonic() - t0) * 1000, 1)
            return {
                "proxy": proxy_raw,
                "alive": 200 <= r.status_code < 400,
                "response_time": elapsed,
                "status_code": r.status_code,
                "error": None,
                "country": "",
                "country_code": "",
                "flag": "",
            }
    except httpx.ProxyError:
        err = "Proxy error"
    except httpx.TimeoutException:
        err = "Timeout"
    except Exception as e:
        err = str(e)[:80]

    return {
        "proxy": proxy_raw,
        "alive": False,
        "response_time": None,
        "status_code": None,
        "error": err,
        "country": "",
        "country_code": "",
        "flag": "",
    }


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

class ProxyCheckRequest(BaseModel):
    proxies: List[str]
    test_url: str = "http://www.google.com"
    timeout: int = 10
    concurrency: int = 50


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/check")
async def check_proxies(payload: ProxyCheckRequest):
    """
    Test proxies concurrently and return results enriched with country info.
    GeoIP lookup runs in parallel with proxy checking — no extra wait time.
    """
    proxies = [p.strip() for p in payload.proxies if p.strip()]
    if not proxies:
        return []

    sem = asyncio.Semaphore(min(payload.concurrency, 200))

    async def bounded(proxy: str):
        async with sem:
            return await _check_one(proxy, payload.test_url, payload.timeout)

    # Run proxy checks and GeoIP lookup simultaneously
    unique_ips   = list({_extract_ip(p) for p in proxies} - {None})
    check_coro   = asyncio.gather(*[bounded(p) for p in proxies])
    country_coro = _lookup_countries(unique_ips)

    results_raw, countries = await asyncio.gather(check_coro, country_coro)
    results = list(results_raw)

    # Merge country data into each result
    for r in results:
        ip  = _extract_ip(r["proxy"])
        geo = countries.get(ip, {})
        r["country"]      = geo.get("country", "")
        r["country_code"] = geo.get("country_code", "")
        r["flag"]         = geo.get("flag", "")

    return results
