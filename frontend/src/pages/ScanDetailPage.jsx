import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Download, Clock, FileText } from 'lucide-react'
import { api } from '../api/client'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import HostTable from '../components/HostTable/HostTable'
import PortBarChart from '../components/Charts/PortBarChart'
import { estimateScanSeconds, formatETA } from '../utils/scanEstimate'

function duration(start, end) {
  if (!start) return null
  const ms = new Date(end ?? Date.now()) - new Date(start)
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  if (m < 1) return `${s}s`
  return `${m}m ${s % 60}s`
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

export default function ScanDetailPage() {
  const { id } = useParams()
  const [scan, setScan]       = useState(null)
  const [hosts, setHosts]     = useState([])
  const [stats, setStats]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const intervalRef = useRef(null)

  async function fetchScan() {
    try {
      const s = await api.getScan(id)
      setScan(s)

      if (s.status === 'completed') {
        const [h, p] = await Promise.all([
          api.getScanHosts(id),
          api.portStats(Number(id)),
        ])
        setHosts(h)
        setStats(p)
        clearInterval(intervalRef.current)
      }

      if (s.status === 'failed') {
        clearInterval(intervalRef.current)
      }
    } catch (e) {
      setError(e.message)
      clearInterval(intervalRef.current)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchScan()
    intervalRef.current = setInterval(fetchScan, 3000)
    return () => clearInterval(intervalRef.current)
  }, [id])

  if (loading && !scan) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-gray-500">
        <Spinner /> Loading…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-red-400 text-sm">
        {error}
      </div>
    )
  }

  if (!scan) return null

  const isActive = scan.status === 'pending' || scan.status === 'running'

  // ETA calculation for running scans
  const totalSecs   = estimateScanSeconds(scan.targets, scan.ports, scan.rate)
  const elapsedSecs = scan.started_at
    ? (Date.now() - new Date(scan.started_at)) / 1000
    : 0
  const remainingSecs = Math.max(0, totalSecs - elapsedSecs)
  const etaLabel      = formatETA(remainingSecs)
  const progressPct   = totalSecs > 0
    ? Math.min(99, Math.round((elapsedSecs / totalSecs) * 100))
    : null

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link to="/scans" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors">
        <ArrowLeft size={14} /> All Scans
      </Link>

      {/* Header */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-lg font-bold text-gray-100">
                {scan.name || `Scan #${scan.id}`}
              </h1>
              <Badge status={scan.status} />
              {isActive && <Spinner size={14} />}
            </div>
            <p className="font-mono text-sm text-gray-400 break-all">{scan.targets}</p>
            <p className="text-xs text-gray-600 mt-1">
              Ports: <span className="text-gray-500 font-mono">{scan.ports}</span>
            </p>
          </div>

          {/* Export buttons */}
          {scan.status === 'completed' && (
            <div className="flex gap-2 flex-wrap">
              <a
                href={api.reportTxtUrl(scan.id)}
                download
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-colors"
                title="Proxy list — ip:port per line"
              >
                <FileText size={12} /> TXT
              </a>
              <a
                href={api.reportUrl(scan.id, 'json')}
                download
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 transition-colors"
              >
                <Download size={12} /> JSON
              </a>
              <a
                href={api.reportUrl(scan.id, 'csv')}
                download
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 transition-colors"
              >
                <Download size={12} /> CSV
              </a>
            </div>
          )}
        </div>

        {/* Meta row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-4 border-t border-gray-800">
          {[
            { label: 'Hosts',    value: scan.hosts_count },
            { label: 'Ports',    value: scan.ports_count },
            { label: 'Rate',     value: `${scan.rate.toLocaleString()} pps` },
            { label: 'Duration', value: duration(scan.started_at, scan.completed_at) || '—' },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-sm font-semibold text-gray-100 tabular-nums mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        {/* Error message */}
        {scan.error_message && (
          <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-red-400 text-xs">
            {scan.error_message}
          </div>
        )}
      </div>

      {/* Running state — ETA + progress + live partial results */}
      {isActive && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          {/* Spinner + status */}
          <div className="flex items-center gap-3">
            <Spinner size={18} />
            <span className="text-gray-300 text-sm font-medium">Scan in progress</span>
            <span className="text-gray-600 text-xs ml-auto">refreshing every 3 s</span>
          </div>

          {/* Progress bar */}
          {progressPct !== null && (
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{progressPct}% estimated</span>
                {etaLabel && (
                  <span className="flex items-center gap-1">
                    <Clock size={11} /> {etaLabel} remaining
                  </span>
                )}
              </div>
              <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-1000"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Live partial results counter */}
          {(scan.hosts_count > 0 || scan.ports_count > 0) && (
            <div className="flex gap-4 text-sm border-t border-gray-800 pt-4">
              <div>
                <span className="text-gray-500 text-xs">Hosts found so far</span>
                <p className="text-green-400 font-semibold tabular-nums">{scan.hosts_count.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Open ports</span>
                <p className="text-green-400 font-semibold tabular-nums">{scan.ports_count.toLocaleString()}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {scan.status === 'completed' && (
        <>
          {/* Port chart */}
          {stats.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
                Port Distribution
              </h2>
              <PortBarChart data={stats} />
            </div>
          )}

          {/* Host table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
              Discovered Hosts
            </h2>
            <HostTable hosts={hosts} />
          </div>
        </>
      )}
    </div>
  )
}
