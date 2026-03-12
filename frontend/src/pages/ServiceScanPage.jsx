import { useState, useRef, useEffect } from 'react'
import {
  Fingerprint, Play, Square, Download, Trash2, Clock,
  ChevronDown, Search, ExternalLink,
} from 'lucide-react'
import { api } from '../api/client'
import Spinner from '../components/ui/Spinner'

// ── Category config ────────────────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'all',     label: 'All',        icon: null  },
  { key: 'camera',  label: 'Cameras',    icon: '📷'  },
  { key: 'dvr',     label: 'DVR/NVR',    icon: '📹'  },
  { key: 'router',  label: 'Routers',    icon: '🖥️'  },
  { key: 'nas',     label: 'NAS',        icon: '💾'  },
  { key: 'printer', label: 'Printers',   icon: '🖨️'  },
  { key: 'proxy',   label: 'Proxies',    icon: '🔀'  },
  { key: 'vpn',     label: 'VPN',        icon: '🔒'  },
  { key: 'web',     label: 'Web',        icon: '🌐'  },
  { key: 'iot',     label: 'IoT',        icon: '📡'  },
  { key: 'ssh',     label: 'SSH',        icon: '🔑'  },
  { key: 'ftp',     label: 'FTP',        icon: '📁'  },
  { key: 'smtp',    label: 'SMTP',       icon: '📧'  },
  { key: 'telnet',  label: 'Telnet',     icon: '💻'  },
  { key: 'unknown', label: 'Unknown',    icon: '❓'  },
]

const CAT_COLORS = {
  camera:  'text-pink-400   border-pink-400/30   bg-pink-400/10',
  dvr:     'text-purple-400 border-purple-400/30 bg-purple-400/10',
  router:  'text-blue-400   border-blue-400/30   bg-blue-400/10',
  nas:     'text-cyan-400   border-cyan-400/30   bg-cyan-400/10',
  printer: 'text-orange-400 border-orange-400/30 bg-orange-400/10',
  proxy:   'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
  vpn:     'text-red-400    border-red-400/30    bg-red-400/10',
  web:     'text-green-400  border-green-400/30  bg-green-400/10',
  iot:     'text-teal-400   border-teal-400/30   bg-teal-400/10',
  ssh:     'text-lime-400   border-lime-400/30   bg-lime-400/10',
  ftp:     'text-indigo-400 border-indigo-400/30 bg-indigo-400/10',
  smtp:    'text-sky-400    border-sky-400/30    bg-sky-400/10',
  telnet:  'text-amber-400  border-amber-400/30  bg-amber-400/10',
  unknown: 'text-gray-500   border-gray-700      bg-gray-800/50',
}

function CatBadge({ category, label, icon }) {
  const cls = CAT_COLORS[category] ?? CAT_COLORS.unknown
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border ${cls}`}>
      {icon} {label}
    </span>
  )
}

// =============================================================================
export default function ServiceScanPage() {
  const [raw, setRaw]                 = useState('')
  const [timeout, setTimeoutVal]      = useState(5)
  const [concurrency, setConcurrency] = useState(50)
  const [results, setResults]         = useState([])
  const [progress, setProgress]       = useState({ checked: 0, total: 0 })
  const [scanning, setScanning]       = useState(false)
  const [error, setError]             = useState(null)
  const [catFilter, setCatFilter]     = useState('all')
  const [search, setSearch]           = useState('')

  // "Load from scan" state
  const [scans, setScans]             = useState([])
  const [scanDropOpen, setScanDropOpen] = useState(false)
  const [scansLoading, setScansLoading] = useState(false)

  const abortRef = useRef(null)

  // ── Load completed scans list for the dropdown ────────────────────────────
  useEffect(() => {
    setScansLoading(true)
    api.listScans({ status: 'completed' })
      .then(data => setScans(data?.items ?? data ?? []))
      .catch(() => {})
      .finally(() => setScansLoading(false))
  }, [])

  // ── Load hosts from a scan into the textarea ──────────────────────────────
  async function loadFromScan(scan) {
    setScanDropOpen(false)
    try {
      const hosts = await api.getScanHosts(scan.id)
      const lines = []
      for (const h of hosts) {
        for (const p of h.ports ?? []) {
          if (p.port) lines.push(`${h.ip}:${p.port}`)
        }
      }
      setRaw(lines.join('\n'))
    } catch (e) {
      setError(e.message)
    }
  }

  // ── Scan logic ─────────────────────────────────────────────────────────────
  const targets = raw.split('\n').map(l => l.trim()).filter(Boolean)

  async function runScan() {
    if (!targets.length) return
    setError(null)
    setResults([])
    setProgress({ checked: 0, total: targets.length })
    setScanning(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await api.fingerprintStream(
        { targets, timeout, concurrency },
        (event) => {
          if (event.type === 'result') {
            setResults(prev => [...prev, event])
            setProgress(p => ({ ...p, checked: p.checked + 1 }))
          } else if (event.type === 'done') {
            setScanning(false)
          }
        },
        controller.signal,
      )
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
      setScanning(false)
    }
  }

  function stopScan() {
    abortRef.current?.abort()
    setScanning(false)
  }

  function clearAll() {
    stopScan()
    setRaw('')
    setResults([])
    setProgress({ checked: 0, total: 0 })
    setError(null)
  }

  // ── Export ────────────────────────────────────────────────────────────────
  function exportJson() {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'fingerprint.json' })
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = results.filter(r => {
    const matchCat = catFilter === 'all' || r.category === catFilter
    const matchSearch = !search || [r.ip, r.server, r.title, r.label, r.banner]
      .some(v => v && v.toLowerCase().includes(search.toLowerCase()))
    return matchCat && matchSearch
  })

  // ── Category counts for tab badges ────────────────────────────────────────
  const counts = {}
  for (const r of results) {
    counts[r.category] = (counts[r.category] ?? 0) + 1
  }
  const identified = results.filter(r => r.category && r.category !== 'unknown').length

  // ── Progress ──────────────────────────────────────────────────────────────
  const progressPct = progress.total > 0
    ? Math.round((progress.checked / progress.total) * 100)
    : 0

  // =============================================================================
  return (
    <div className="max-w-6xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Fingerprint size={20} className="text-purple-400" />
        <div>
          <h1 className="text-xl font-bold text-gray-100">Service Fingerprinting</h1>
          <p className="text-sm text-gray-500">
            Identifica servidores web, routers, cámaras, DVRs y más — en tiempo real
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Left panel — input ────────────────────────────────────────── */}
        <div className="space-y-4">
          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Textarea */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-400">
                Targets <span className="text-gray-600">(ip:port por línea)</span>
              </label>
              {targets.length > 0 && (
                <span className="text-xs text-gray-600">{targets.length.toLocaleString()}</span>
              )}
            </div>
            <textarea
              rows={10}
              placeholder={'192.168.1.1:80\n10.0.0.1:8080\n1.2.3.4:22\n1.2.3.4:443'}
              value={raw}
              onChange={e => setRaw(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-xs font-mono text-gray-100 placeholder-gray-600 focus:outline-none focus:border-purple-500/60 resize-none"
            />
          </div>

          {/* Load from scan dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setScanDropOpen(o => !o)}
              className="w-full flex items-center justify-between text-xs bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                {scansLoading ? <Spinner size={11} /> : null}
                Cargar desde un scan completado…
              </span>
              <ChevronDown size={13} />
            </button>
            {scanDropOpen && (
              <div className="absolute z-20 mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-h-52 overflow-y-auto">
                {scans.length === 0 && (
                  <div className="px-3 py-3 text-xs text-gray-600">No hay scans completados</div>
                )}
                {scans.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => loadFromScan(s)}
                    className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-800 flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{s.name || `Scan #${s.id}`}</span>
                    <span className="text-gray-600 shrink-0">
                      {s.ports_count?.toLocaleString()} hosts
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Timeout & Concurrency */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Timeout — <span className="text-gray-300 font-mono">{timeout}s</span>
              </label>
              <input type="range" min={2} max={15} step={1} value={timeout}
                onChange={e => setTimeoutVal(Number(e.target.value))}
                className="w-full accent-purple-400" />
              <div className="flex justify-between text-xs text-gray-600 mt-0.5"><span>2s</span><span>15s</span></div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Concurrencia — <span className="text-gray-300 font-mono">{concurrency}</span>
              </label>
              <input type="range" min={5} max={200} step={5} value={concurrency}
                onChange={e => setConcurrency(Number(e.target.value))}
                className="w-full accent-purple-400" />
              <div className="flex justify-between text-xs text-gray-600 mt-0.5"><span>5</span><span>200</span></div>
            </div>
          </div>

          {/* Estimate */}
          {targets.length > 0 && !scanning && (
            <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
              <Clock size={11} />
              <span>
                ~{Math.ceil(targets.length / concurrency * timeout)}s estimado
                · {targets.length.toLocaleString()} targets
              </span>
            </div>
          )}

          {/* Progress bar */}
          {scanning && progress.total > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2.5 space-y-1.5">
              <div className="flex justify-between text-xs text-gray-400">
                <span className="flex items-center gap-1.5">
                  <Spinner size={11} />
                  {progress.checked.toLocaleString()} / {progress.total.toLocaleString()}
                </span>
                <span className="text-purple-400 font-semibold">{progressPct}%</span>
              </div>
              <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={scanning ? stopScan : runScan}
              disabled={!scanning && targets.length === 0}
              className={`flex-1 flex items-center justify-center gap-2 font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-40 ${
                scanning
                  ? 'bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30'
                  : 'bg-purple-600 hover:bg-purple-500 text-white'
              }`}
            >
              {scanning
                ? <><Square size={14} /> Detener</>
                : <><Play size={14} /> Fingerprint</>
              }
            </button>
            <button onClick={clearAll}
              className="px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200 transition-colors">
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* ── Right panel — results ─────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Stats row */}
          {results.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-gray-100 tabular-nums">{results.length.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-0.5">Escaneados</p>
              </div>
              <div className="bg-gray-900 border border-purple-500/20 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-purple-400 tabular-nums">{identified.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-0.5">Identificados</p>
              </div>
              {Object.entries(counts)
                .filter(([k]) => k !== 'unknown')
                .sort((a, b) => b[1] - a[1])
                .slice(0, 2)
                .map(([cat, count]) => {
                  const cfg = CATEGORIES.find(c => c.key === cat)
                  return (
                    <div key={cat} className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
                      <p className="text-xl font-bold text-gray-100 tabular-nums">
                        {cfg?.icon} {count}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{cfg?.label ?? cat}</p>
                    </div>
                  )
                })
              }
            </div>
          )}

          {/* Category filter + search + export */}
          {results.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Category chips — only show categories that have results */}
              <div className="flex flex-wrap gap-1.5 flex-1">
                {CATEGORIES.filter(c => c.key === 'all' || counts[c.key]).map(c => (
                  <button key={c.key} onClick={() => setCatFilter(c.key)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                      catFilter === c.key
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                        : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600'
                    }`}>
                    {c.icon} {c.label}
                    {c.key !== 'all' && counts[c.key]
                      ? <span className="ml-1 text-gray-600">({counts[c.key]})</span>
                      : null
                    }
                  </button>
                ))}
              </div>
              <button onClick={exportJson}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200 transition-colors">
                <Download size={11} /> JSON
              </button>
            </div>
          )}

          {/* Search bar */}
          {results.length > 0 && (
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input type="text" placeholder="Buscar IP, título, servidor…"
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-purple-500/50" />
            </div>
          )}

          {/* Empty state */}
          {!scanning && results.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 gap-2 text-gray-600 text-sm border border-dashed border-gray-800 rounded-xl">
              <Fingerprint size={32} className="opacity-20" />
              <span>Pega ip:port targets o carga desde un scan</span>
              <div className="flex flex-wrap justify-center gap-2 mt-2 text-xs text-gray-700">
                {['📷 Cámaras', '🖥️ Routers', '🌐 Web', '🔑 SSH', '📁 FTP'].map(t => (
                  <span key={t} className="bg-gray-900 border border-gray-800 rounded px-2 py-0.5">{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Results table */}
          {filtered.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-800 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {filtered.length.toLocaleString()} resultado{filtered.length !== 1 ? 's' : ''}
                  {catFilter !== 'all' || search ? ` (filtrado de ${results.length.toLocaleString()})` : ''}
                </span>
              </div>
              <div className="overflow-y-auto max-h-[500px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-900 border-b border-gray-800 z-10">
                    <tr className="text-gray-500 uppercase tracking-wide text-[10px]">
                      <th className="px-3 py-2 text-left">IP:Port</th>
                      <th className="px-3 py-2 text-left">Tipo</th>
                      <th className="px-3 py-2 text-left">Servidor</th>
                      <th className="px-3 py-2 text-left">Título / Banner</th>
                      <th className="px-3 py-2 text-center">SSL</th>
                      <th className="px-3 py-2 text-right">Code</th>
                      <th className="px-3 py-2 w-6"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {filtered.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-800/40 transition-colors">
                        <td className="px-3 py-2 font-mono text-gray-200 whitespace-nowrap">
                          {r.ip}
                          <span className="text-gray-500">:{r.port}</span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {r.category
                            ? <CatBadge category={r.category} label={r.label} icon={r.icon} />
                            : <span className="text-gray-600">—</span>
                          }
                        </td>
                        <td className="px-3 py-2 text-gray-400 max-w-[120px] truncate" title={r.server ?? ''}>
                          {r.server || <span className="text-gray-600">—</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-400 max-w-[200px] truncate"
                          title={r.title ?? r.banner ?? ''}>
                          {r.title
                            ? <span className="text-gray-200">{r.title}</span>
                            : r.banner
                              ? <span className="font-mono text-gray-500">{r.banner.slice(0, 60)}</span>
                              : <span className="text-gray-700">—</span>
                          }
                        </td>
                        <td className="px-3 py-2 text-center">
                          {r.ssl
                            ? <span className="text-green-400 font-bold text-[10px]">TLS</span>
                            : <span className="text-gray-700">—</span>
                          }
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-gray-600">
                          {r.status_code ?? '—'}
                        </td>
                        <td className="px-3 py-2">
                          {(r.service === 'http' || r.service === 'https') && (
                            <a href={`${r.ssl ? 'https' : 'http'}://${r.ip}:${r.port}`}
                              target="_blank" rel="noreferrer"
                              className="text-gray-600 hover:text-gray-300 transition-colors"
                              title="Abrir en navegador">
                              <ExternalLink size={11} />
                            </a>
                          )}
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
    </div>
  )
}
