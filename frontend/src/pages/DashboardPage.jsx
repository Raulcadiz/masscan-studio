import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Server, Activity, Globe, Clock, Plus, ChevronRight } from 'lucide-react'
import { api } from '../api/client'
import StatsCard from '../components/ui/StatsCard'
import Badge from '../components/ui/Badge'
import PortBarChart from '../components/Charts/PortBarChart'
import Spinner from '../components/ui/Spinner'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

export default function DashboardPage() {
  const [scans, setScans] = useState([])
  const [portStats, setPortStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([api.listScans(), api.portStats()])
      .then(([s, p]) => {
        setScans(s)
        setPortStats(p)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
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

  const completed = scans.filter((s) => s.status === 'completed')
  const totalHosts = completed.reduce((acc, s) => acc + s.hosts_count, 0)
  const totalPorts = completed.reduce((acc, s) => acc + s.ports_count, 0)
  const lastScan = scans[0]
  const recent = scans.slice(0, 6)

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Network scan overview</p>
        </div>
        <Link
          to="/scans/new"
          className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-gray-950 font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={15} />
          New Scan
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard label="Total Scans"   value={scans.length}  icon={Activity} />
        <StatsCard label="Hosts Found"   value={totalHosts}    icon={Server}   accent="text-cyan-400" />
        <StatsCard label="Open Ports"    value={totalPorts}    icon={Globe}    accent="text-purple-400" />
        <StatsCard
          label="Last Scan"
          value={lastScan ? `#${lastScan.id}` : '—'}
          icon={Clock}
          accent="text-yellow-400"
          sub={lastScan ? formatDate(lastScan.created_at) : undefined}
        />
      </div>

      {/* Chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wide">
          Port Distribution (top 20)
        </h2>
        <PortBarChart data={portStats} />
      </div>

      {/* Recent scans */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
            Recent Scans
          </h2>
          <Link to="/scans" className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1">
            View all <ChevronRight size={12} />
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-600 text-sm">
            No scans yet.{' '}
            <Link to="/scans/new" className="text-green-400 hover:underline">
              Start your first scan →
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wide border-b border-gray-800">
                <th className="px-5 py-3 text-left">ID</th>
                <th className="px-5 py-3 text-left">Target</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-right">Hosts</th>
                <th className="px-5 py-3 text-right">Ports</th>
                <th className="px-5 py-3 text-right">Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {recent.map((s) => (
                <tr key={s.id} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-3 font-mono text-gray-400">#{s.id}</td>
                  <td className="px-5 py-3 font-mono text-gray-100">{s.targets}</td>
                  <td className="px-5 py-3"><Badge status={s.status} /></td>
                  <td className="px-5 py-3 text-right tabular-nums text-gray-300">{s.hosts_count}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-gray-300">{s.ports_count}</td>
                  <td className="px-5 py-3 text-right text-gray-500 text-xs">{formatDate(s.created_at)}</td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      to={`/scans/${s.id}`}
                      className="text-xs text-green-400 hover:text-green-300"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
