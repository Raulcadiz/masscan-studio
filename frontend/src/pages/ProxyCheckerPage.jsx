import { useState, useRef, useEffect } from 'react'
import {
  ShieldCheck, Play, Square, Download, Trash2, Clock,
  CheckCircle, XCircle, AlertCircle, Search, Globe, ChevronDown, Info,
} from 'lucide-react'
import { api } from '../api/client'
import Spinner from '../components/ui/Spinner'
import Badge from '../components/ui/Badge'
import COUNTRY_IPS from '../data/country_ips.json'
import { estimateScanSeconds, countTargetIPs, formatETA } from '../utils/scanEstimate'

// ── Proxy port presets ────────────────────────────────────────────────────────
const PROXY_PRESETS = {
  http:   { label: 'HTTP',      ports: '80,3128,8080,8118,8888,8000,8001,9090' },
  socks:  { label: 'SOCKS4/5', ports: '1080,1081,4145,9050,9150' },
  all:    { label: 'All Proxy', ports: '80,1080,3128,4145,8080,8118,8888,9050' },
  custom: { label: 'Custom',    ports: '' },
}

// ── Country list ──────────────────────────────────────────────────────────────
const COUNTRY_LIST = Object.entries(COUNTRY_IPS)
  .map(([code, { name, flag }]) => ({ code, name, flag }))
  .sort((a, b) => a.name.localeCompare(b.name))

// ── Helper: extract bare IP from any proxy format ─────────────────────────────
function extractIp(proxy = '') {
  proxy = proxy.trim()
  if (proxy.includes('://')) {
    try { return new URL(proxy).hostname } catch { return '' }
  }
  return proxy.split(':')[0] || ''
}

// ── Status icon ───────────────────────────────────────────────────────────────
function StatusIcon({ alive, error }) {
  if (alive)  return <CheckCircle  size={13} className="text-green-400 shrink-0" />
  if (error)  return <XCircle      size={13} className="text-red-400   shrink-0" />
  return             <AlertCircle  size={13} className="text-gray-500  shrink-0" />
}

// =============================================================================
export default function ProxyCheckerPage() {
  const [tab, setTab] = useState('checker')

  // ── Checker state ──────────────────────────────────────────────────────────
  const [raw, setRaw]                 = useState('')
  const [testUrl, setTestUrl]         = useState('http://www.google.com')
  const [timeout, setTimeoutVal]      = useState(10)
  const [concurrency, setConcurrency] = useState(50)
  const [results, setResults]         = useState([])
  const [progress, setProgress]       = useState({ checked: 0, total: 0 })
  const [checking, setChecking]       = useState(false)
  const [checkError, setCheckError]   = useState(null)
  const abortRef = useRef(null)

  // ── Discover state ─────────────────────────────────────────────────────────
  const [discMode, setDiscMode]           = useState('country')
  const [countrySearch, setCountrySearch] = useState('')
  const [selectedCountry, setSelectedCountry] = useState(null)
  const [dropOpen, setDropOpen]           = useState(false)
  const [manualTarget, setManualTarget]   = useState('')
  const [portPreset, setPortPreset]       = useState('all')
  const [customPorts, setCustomPorts]     = useState('')
  const [discRate, setDiscRate]           = useState(1000)
  const [discScan, setDiscScan]           = useState(null)
  const [discLoading, setDiscLoading]     = useState(false)
  const [discError, setDiscError]         = useState(null)
  const pollRef = useRef(null)

  useEffect(() => () => clearInterval(pollRef.current), [])

  // ── Checker derived ────────────────────────────────────────────────────────
  const proxyLines = raw.split('\n').map(l => l.trim()).filter(Boolean)
  const alive = results.filter(r => r.alive)
  const dead  = results.filter(r => !r.alive)

  async function runCheck() {
    if (!proxyLines.length) return
    setCheckError(null)
    setResults([])
    setProgress({ checked: 0, total: proxyLines.length })
    setChecking(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await api.checkProxiesStream(
        { proxies: proxyLines, test_url: testUrl, timeout, concurrency },
        (event) => {
          if (event.type === 'result') {
            setResults(prev => [...prev, event])
            setProgress(p => ({ ...p, checked: p.checked + 1 }))
          } else if (event.type === 'countries') {
            // Merge GeoIP data into existing results
            setResults(prev => prev.map(r => {
              const ip  = extractIp(r.proxy)
              const geo = event.data?.[ip] ?? {}
              return {
                ...r,
                country:      geo.country      ?? r.country,
                country_code: geo.country_code ?? r.country_code,
                flag:         geo.flag         ?? r.flag,
              }
            }))
          } else if (event.type === 'done') {
            setChecking(false)
          }
        },
        controller.signal,
      )
    } catch (e) {
      if (e.name !== 'AbortError') setCheckError(e.message)
      setChecking(false)
    }
  }

  function stopCheck() {
    abortRef.current?.abort()
    setChecking(false)
  }

  function clearChecker() {
    stopCheck()
    setRaw('')
    setResults([])
    setProgress({ checked: 0, total: 0 })
    setCheckError(null)
  }

  function exportAlive() {
    const text = alive.map(r => r.proxy).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'proxies_alive.txt' })
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Discover helpers ───────────────────────────────────────────────────────
  const discPorts   = portPreset === 'custom' ? customPorts : PROXY_PRESETS[portPreset].ports
  const discTargets = discMode === 'country' && selectedCountry
    ? COUNTRY_IPS[selectedCountry.code].cidrs.join(' ')
    : manualTarget

  const filteredCountries = countrySearch
    ? COUNTRY_LIST.filter(c =>
        c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
        c.code.toLowerCase().includes(countrySearch.toLowerCase()))
    : COUNTRY_LIST

  async function startDiscover() {
    if (!discTargets || !discPorts) return
    setDiscError(null)
    setDiscScan(null)
    setDiscLoading(true)
    clearInterval(pollRef.current)

    try {
      const scan = await api.createScan({
        name:         `Proxy Discovery${selectedCountry ? ` - ${selectedCountry.name}` : ''}`,
        targets:      discTargets,
        ports:        discPorts,
        rate:         discRate,
        nmap_enabled: false,
      })
      setDiscScan(scan)

      pollRef.current = setInterval(async () => {
        try {
          const s = await api.getScan(scan.id)
          setDiscScan(s)
          if (s.status === 'completed' || s.status === 'stopped' || s.status === 'failed') {
            clearInterval(pollRef.current)
            setDiscLoading(false)
          }
        } catch (e) {
          clearInterval(pollRef.current)
          setDiscLoading(false)
          setDiscError(e.message)
        }
      }, 3000)
    } catch (e) {
      setDiscError(e.message)
      setDiscLoading(false)
    }
  }

  async function loadDiscoverResults() {
    if (!discScan) return
    try {
      const hosts = await api.getScanHosts(discScan.id)
      const lines = []
      for (const h of hosts) {
        for (const p of h.ports ?? []) {
          if (p.port) lines.push(`${h.ip}:${p.port}`)
        }
      }
      setRaw(lines.join('\n'))
      setTab('checker')
    } catch (e) {
      setDiscError(e.message)
    }
  }

  function stopDiscover() {
    clearInterval(pollRef.current)
    if (discScan) api.stopScan(discScan.id).catch(() => {})
    setDiscLoading(false)
  }

  // ── Discover ETA ───────────────────────────────────────────────────────────
  const discSecs    = discTargets && discPorts ? estimateScanSeconds(discTargets, discPorts, discRate) : 0
  const discETA     = formatETA(discSecs)
  const discIPs     = discTargets ? countTargetIPs(discTargets) : 0
  const discActive  = discScan && (discScan.status === 'pending' || discScan.status === 'running')
  const discElapsed = discScan?.started_at ? (Date.now() - new Date(discScan.started_at)) / 1000 : 0
  const discProgress = discSecs > 0 ? Math.min(99, Math.round((discElapsed / discSecs) * 100)) : null

  // ── Progress derived ───────────────────────────────────────────────────────
  const progressPct = progress.total > 0 ? Math.round((progress.checked / progress.total) * 100) : 0
  const estRemainingS = checking && progress.checked > 0
    ? Math.round(((progress.total - progress.checked) / progress.checked)
        * ((Date.now() - (checking ? Date.now() : 0)) / 1000 + 1))
    : null

  // =============================================================================
  return (
    <div className="max-w-5xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShieldCheck size={20} className="text-green-400" />
        <div>
          <h1 className="text-xl font-bold text-gray-100">Proxy Checker</h1>
          <p className="text-sm text-gray-500">Test HTTP / HTTPS / SOCKS5 proxies — or scan the internet to find new ones</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit">
        {[
          { key: 'checker',  label: 'Checker',         icon: ShieldCheck },
          { key: 'discover', label: 'Discover Proxies', icon: Search },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-md transition-colors ${
              tab === key ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:text-gray-300'
            }`}>
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════ CHECKER TAB ════════════════════════════ */}
      {tab === 'checker' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left — input */}
          <div className="space-y-4">
            {checkError && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-red-400 text-sm">
                {checkError}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-400">
                  Proxy List <span className="text-gray-600">(one per line)</span>
                </label>
                {proxyLines.length > 0 && (
                  <span className="text-xs text-gray-600">{proxyLines.length.toLocaleString()} proxies</span>
                )}
              </div>
              <textarea
                rows={11}
                placeholder={'192.168.1.1:8080\n10.0.0.1:3128:user:pass\nsocks5://1.2.3.4:1080'}
                value={raw}
                onChange={e => setRaw(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-xs font-mono text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500/60 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Test URL</label>
              <input type="text" value={testUrl} onChange={e => setTestUrl(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-gray-100 focus:outline-none focus:border-green-500/60" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Timeout — <span className="text-gray-300 font-mono">{timeout}s</span>
                </label>
                <input type="range" min={2} max={30} step={1} value={timeout}
                  onChange={e => setTimeoutVal(Number(e.target.value))}
                  className="w-full accent-green-400" />
                <div className="flex justify-between text-xs text-gray-600 mt-0.5"><span>2s</span><span>30s</span></div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Concurrencia — <span className="text-gray-300 font-mono">{concurrency}</span>
                </label>
                <input type="range" min={5} max={200} step={5} value={concurrency}
                  onChange={e => setConcurrency(Number(e.target.value))}
                  className="w-full accent-green-400" />
                <div className="flex justify-between text-xs text-gray-600 mt-0.5"><span>5</span><span>200</span></div>
              </div>
            </div>

            {/* Estimated time */}
            {proxyLines.length > 0 && !checking && (
              <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
                <Clock size={11} />
                <span>
                  ~{Math.ceil(proxyLines.length / concurrency * timeout)}s estimado
                  · {proxyLines.length.toLocaleString()} proxies
                  · {concurrency} concurrent
                </span>
              </div>
            )}

            {/* Progress bar while checking */}
            {checking && progress.total > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2.5 space-y-1.5">
                <div className="flex justify-between text-xs text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <Spinner size={11} />
                    {progress.checked.toLocaleString()} / {progress.total.toLocaleString()} comprobados
                  </span>
                  <span className="text-green-400 font-semibold">{progressPct}%</span>
                </div>
                <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all duration-300"
                    style={{ width: `${progressPct}%` }} />
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={checking ? stopCheck : runCheck}
                disabled={!checking && proxyLines.length === 0}
                className={`flex-1 flex items-center justify-center gap-2 font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-40 ${
                  checking
                    ? 'bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30'
                    : 'bg-green-500 hover:bg-green-400 text-gray-950'
                }`}>
                {checking ? <><Square size={14} /> Detener</> : <><Play size={14} /> Check Proxies</>}
              </button>
              <button onClick={clearChecker}
                className="px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-40 transition-colors">
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          {/* Right — results */}
          <div className="space-y-4">
            {/* Stats */}
            {(results.length > 0 || checking) && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-gray-100 tabular-nums">{results.length.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Comprobados</p>
                </div>
                <div className="bg-gray-900 border border-green-500/20 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-green-400 tabular-nums">{alive.length.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Alive</p>
                </div>
                <div className="bg-gray-900 border border-red-500/20 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-red-400 tabular-nums">{dead.length.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Dead</p>
                </div>
              </div>
            )}

            {/* Export */}
            {alive.length > 0 && (
              <button onClick={exportAlive}
                className="w-full flex items-center justify-center gap-2 text-xs py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors">
                <Download size={12} /> Exportar {alive.length.toLocaleString()} proxies activos (.txt)
              </button>
            )}

            {/* Empty state */}
            {!checking && results.length === 0 && (
              <div className="flex flex-col items-center justify-center h-52 gap-2 text-gray-600 text-sm border border-dashed border-gray-800 rounded-xl">
                <ShieldCheck size={28} className="opacity-30" />
                <span>Pega proxies y pulsa Check</span>
                <span className="text-xs text-gray-700">Los resultados aparecen en tiempo real</span>
              </div>
            )}

            {/* Results table */}
            {results.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="overflow-y-auto max-h-[420px]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-900 border-b border-gray-800 z-10">
                      <tr className="text-gray-500 uppercase tracking-wide text-[10px]">
                        <th className="px-2 py-2 w-4"></th>
                        <th className="px-2 py-2 text-left">Proxy</th>
                        <th className="px-2 py-2 text-left">País</th>
                        <th className="px-2 py-2 text-right">ms</th>
                        <th className="px-2 py-2 text-right">Code</th>
                        <th className="px-2 py-2 text-left">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/60">
                      {results.map((r, i) => (
                        <tr key={i}
                          className={r.alive
                            ? 'hover:bg-green-500/5'
                            : 'hover:bg-gray-800/30 opacity-40'}>
                          <td className="px-2 py-1.5">
                            <StatusIcon alive={r.alive} error={r.error} />
                          </td>
                          <td className="px-2 py-1.5 font-mono text-gray-200 max-w-[130px] truncate">
                            {r.proxy}
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            {r.flag
                              ? <span title={r.country} className="text-gray-300">
                                  {r.flag} <span className="text-gray-600">{r.country_code}</span>
                                </span>
                              : <span className="text-gray-700">—</span>
                            }
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {r.response_time != null
                              ? <span className={r.response_time < 1000 ? 'text-green-400' : 'text-yellow-400'}>
                                  {r.response_time}
                                </span>
                              : <span className="text-gray-700">—</span>
                            }
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-gray-600">
                            {r.status_code ?? '—'}
                          </td>
                          <td className="px-2 py-1.5 text-gray-600 max-w-[90px] truncate">
                            {r.error ?? ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════ DISCOVER TAB ═══════════════════════════ */}
      {tab === 'discover' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left — config */}
          <div className="space-y-4">
            {discError && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-red-400 text-sm">
                {discError}
              </div>
            )}

            {/* Target mode */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Objetivo</label>
              <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1 mb-3">
                {[{ key: 'country', label: 'País', icon: Globe }, { key: 'manual', label: 'Manual CIDR', icon: null }]
                  .map(({ key, label, icon: Icon }) => (
                    <button key={key} type="button" onClick={() => setDiscMode(key)}
                      className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md transition-colors ${
                        discMode === key ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:text-gray-300'
                      }`}>
                      {Icon && <Icon size={12} />} {label}
                    </button>
                  ))}
              </div>

              {discMode === 'country' && (
                <div className="relative">
                  <button type="button" onClick={() => setDropOpen(o => !o)}
                    className="w-full flex items-center justify-between bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none">
                    {selectedCountry
                      ? <span>{selectedCountry.flag} {selectedCountry.name}</span>
                      : <span className="text-gray-500">Selecciona un país…</span>
                    }
                    <ChevronDown size={14} className="text-gray-500" />
                  </button>
                  {dropOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg shadow-xl">
                      <div className="p-2 border-b border-gray-800">
                        <input autoFocus type="text" placeholder="Buscar país…" value={countrySearch}
                          onChange={e => setCountrySearch(e.target.value)}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none" />
                      </div>
                      <ul className="max-h-48 overflow-y-auto py-1">
                        {filteredCountries.map(c => (
                          <li key={c.code}>
                            <button type="button"
                              onClick={() => { setSelectedCountry(c); setDropOpen(false); setCountrySearch('') }}
                              className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-800 flex items-center gap-2">
                              <span>{c.flag}</span><span>{c.name}</span>
                              <span className="ml-auto text-xs text-gray-600">{c.code}</span>
                            </button>
                          </li>
                        ))}
                        {filteredCountries.length === 0 && (
                          <li className="px-3 py-2 text-sm text-gray-600">Sin resultados</li>
                        )}
                      </ul>
                    </div>
                  )}
                  {selectedCountry && (
                    <div className="flex items-center gap-2 text-xs text-yellow-400/80 bg-yellow-400/5 border border-yellow-400/20 rounded-lg px-3 py-2 mt-2">
                      <Info size={12} />
                      <span>{COUNTRY_IPS[selectedCountry.code].cidrs.length} CIDRs — {selectedCountry.name}</span>
                    </div>
                  )}
                </div>
              )}

              {discMode === 'manual' && (
                <input type="text" placeholder="0.0.0.0/0  o  1.2.3.0/24 5.6.7.0/24"
                  value={manualTarget} onChange={e => setManualTarget(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500/60" />
              )}
            </div>

            {/* Port preset */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Puertos proxy</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {Object.entries(PROXY_PRESETS).map(([key, { label }]) => (
                  <button key={key} type="button" onClick={() => setPortPreset(key)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      portPreset === key
                        ? 'bg-green-500/15 text-green-400 border-green-500/40'
                        : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600'
                    }`}>{label}</button>
                ))}
              </div>
              <input type="text" placeholder="1080,3128,8080"
                value={portPreset === 'custom' ? customPorts : PROXY_PRESETS[portPreset].ports}
                onChange={e => { setPortPreset('custom'); setCustomPorts(e.target.value) }}
                readOnly={portPreset !== 'custom'}
                className={`w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs font-mono text-gray-400 focus:outline-none ${portPreset !== 'custom' ? 'opacity-60 cursor-default' : 'focus:border-green-500/60'}`} />
            </div>

            {/* Rate */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Rate — <span className="text-gray-300 font-mono">{discRate.toLocaleString()} pps</span>
              </label>
              <input type="range" min={100} max={10000} step={100} value={discRate}
                onChange={e => setDiscRate(Number(e.target.value))}
                className="w-full accent-green-400" />
              <div className="flex justify-between text-xs text-gray-600 mt-0.5"><span>100</span><span>10,000</span></div>
            </div>

            {/* ETA */}
            {discTargets && discPorts && discETA && (
              <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${
                discSecs > 3600
                  ? 'bg-yellow-400/5 border-yellow-400/20 text-yellow-400/80'
                  : 'bg-gray-900 border-gray-800 text-gray-500'
              }`}>
                <Clock size={11} className="shrink-0" />
                <span>
                  Duración estimada: <span className="font-semibold">{discETA}</span>
                  {' · '}{discIPs.toLocaleString()} IPs · {discRate.toLocaleString()} pps
                </span>
              </div>
            )}

            <button onClick={discActive ? stopDiscover : startDiscover}
              disabled={!discActive && (!discTargets || !discPorts)}
              className={`w-full flex items-center justify-center gap-2 font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-40 ${
                discActive
                  ? 'bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30'
                  : 'bg-green-500 hover:bg-green-400 text-gray-950'
              }`}>
              {discActive ? <><Square size={14} /> Detener</> : <><Search size={14} /> Buscar Proxies</>}
              {discLoading && <Spinner size={14} />}
            </button>
          </div>

          {/* Right — scan progress */}
          <div className="space-y-4">
            {!discScan && !discLoading && (
              <div className="flex flex-col items-center justify-center h-64 gap-2 text-gray-600 text-sm border border-dashed border-gray-800 rounded-xl">
                <Search size={28} className="opacity-30" />
                <span>Configura el objetivo y pulsa Buscar</span>
                <span className="text-xs text-gray-700">Usa masscan para encontrar puertos proxy abiertos</span>
                <span className="text-xs text-gray-700 mt-2 px-4 text-center">
                  💡 Es normal encontrar pocos proxies reales (~0.01–0.1% de IPs escaneadas)
                </span>
              </div>
            )}

            {discScan && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <Badge status={discScan.status} />
                  {discActive && <Spinner size={14} />}
                  <span className="text-xs text-gray-600 ml-auto">Scan #{discScan.id}</span>
                </div>

                {discActive && discProgress !== null && (
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{discProgress}% estimado</span>
                      {formatETA(Math.max(0, discSecs - discElapsed)) && (
                        <span className="flex items-center gap-1">
                          <Clock size={11} /> {formatETA(Math.max(0, discSecs - discElapsed))} restante
                        </span>
                      )}
                    </div>
                    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full transition-all duration-1000"
                        style={{ width: `${discProgress}%` }} />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 border-t border-gray-800 pt-4">
                  <div>
                    <p className="text-xs text-gray-500">Hosts encontrados</p>
                    <p className="text-lg font-bold text-green-400 tabular-nums">
                      {discScan.hosts_count?.toLocaleString() ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Puertos abiertos</p>
                    <p className="text-lg font-bold text-green-400 tabular-nums">
                      {discScan.ports_count?.toLocaleString() ?? 0}
                    </p>
                  </div>
                </div>

                {(discScan.status === 'completed' || discScan.status === 'stopped') &&
                  discScan.ports_count > 0 && (
                  <button onClick={loadDiscoverResults}
                    className="w-full flex items-center justify-center gap-2 text-sm py-2.5 rounded-lg bg-green-500 hover:bg-green-400 text-gray-950 font-semibold transition-colors">
                    <ShieldCheck size={14} />
                    Cargar {discScan.ports_count.toLocaleString()} proxies en el Checker
                  </button>
                )}

                {discScan.status === 'completed' && discScan.ports_count === 0 && (
                  <p className="text-sm text-gray-500 text-center pt-2">
                    No se encontraron puertos abiertos. Prueba otro país o más IPs.
                  </p>
                )}

                {discScan.error_message && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-red-400 text-xs">
                    {discScan.error_message}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
