const BASE = '/api'
const TIMEOUT_MS = 15000

async function req(path, opts = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      signal: controller.signal,
      ...opts,
    })
    if (res.status === 204) return null
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail || 'Request failed')
    }
    return res.json()
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out — is the backend running?')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

export const api = {
  // Scans
  listScans: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return req(`/scans${q ? `?${q}` : ''}`)
  },
  getScan:      (id)    => req(`/scans/${id}`),
  createScan:   (data)  => req('/scans', { method: 'POST', body: JSON.stringify(data) }),
  deleteScan:   (id)    => req(`/scans/${id}`, { method: 'DELETE' }),
  stopScan:     (id)    => req(`/scans/${id}/stop`, { method: 'POST' }),
  getScanHosts: (id)    => req(`/scans/${id}/hosts`),
  compareScans: (a, b)  => req('/scans/compare', {
    method: 'POST',
    body: JSON.stringify({ scan_id_a: a, scan_id_b: b }),
  }),

  // Ports
  portStats:  (scan_id) => req(`/ports/stats${scan_id != null ? `?scan_id=${scan_id}` : ''}`),
  topPorts:   (limit = 20, scan_id) =>
    req(`/ports/top?limit=${limit}${scan_id != null ? `&scan_id=${scan_id}` : ''}`),
  services:   (scan_id) => req(`/ports/services${scan_id != null ? `?scan_id=${scan_id}` : ''}`),

  // Proxies — long timeout: N proxies / concurrency * timeout_s * 1000 ms
  checkProxies: (data) => req('/proxies/check', { method: 'POST', body: JSON.stringify(data) }, 300_000),

  // Reports — return URL strings for use in <a href> download links
  reportUrl:      (scan_id, format = 'json') => `${BASE}/reports/${scan_id}?format=${format}`,
  reportTxtUrl:   (scan_id)                  => `${BASE}/reports/${scan_id}?format=txt`,
  allReportTxtUrl: ()                        => `${BASE}/reports/all/txt`,
  allReportZipUrl: ()                        => `${BASE}/reports/all/zip`,
}
