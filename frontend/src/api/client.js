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

  // Proxies — batch (small lists only)
  checkProxies: (data) => req('/proxies/check', { method: 'POST', body: JSON.stringify(data) }, 300_000),

  /**
   * Stream proxy check results via SSE.
   * Calls onEvent(event) for every parsed SSE event object.
   * Pass an AbortSignal to allow cancellation.
   *
   * Event shapes:
   *   { type: 'result',    proxy, alive, response_time, status_code, error, country, country_code, flag }
   *   { type: 'countries', data: { ip: { country, country_code, flag } } }
   *   { type: 'done',      total, alive }
   */
  checkProxiesStream: async (data, onEvent, signal) => {
    const res = await fetch(`${BASE}/proxies/check/stream`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
      signal,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail || 'Request failed')
    }

    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let   buffer  = ''

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()   // keep any incomplete trailing line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try { onEvent(JSON.parse(line.slice(6))) } catch (_) { /* ignore malformed */ }
      }
    }
  },

  // Reports — return URL strings for use in <a href> download links
  reportUrl:      (scan_id, format = 'json') => `${BASE}/reports/${scan_id}?format=${format}`,
  reportTxtUrl:   (scan_id)                  => `${BASE}/reports/${scan_id}?format=txt`,
  allReportTxtUrl: ()                        => `${BASE}/reports/all/txt`,
  allReportZipUrl: ()                        => `${BASE}/reports/all/zip`,
}
