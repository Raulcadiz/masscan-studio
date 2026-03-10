import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '../api/client'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

export default function ScansPage() {
  const [scans, setScans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(null)

  async function load() {
    try {
      setScans(await api.listScans())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function remove(id) {
    if (!confirm(`Delete scan #${id} and all its data?`)) return
    setDeleting(id)
    try {
      await api.deleteScan(id)
      setScans((prev) => prev.filter((s) => s.id !== id))
    } catch (e) {
      alert(e.message)
    } finally {
      setDeleting(null)
    }
  }

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-100">All Scans</h1>
          <p className="text-sm text-gray-500 mt-0.5">{scans.length} scan{scans.length !== 1 ? 's' : ''} total</p>
        </div>
        <Link
          to="/scans/new"
          className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-gray-950 font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={15} /> New Scan
        </Link>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {scans.length === 0 ? (
          <div className="px-5 py-16 text-center text-gray-600 text-sm">
            No scans yet.{' '}
            <Link to="/scans/new" className="text-green-400 hover:underline">
              Start your first scan →
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wide border-b border-gray-800 bg-gray-900/80">
                <th className="px-5 py-3 text-left">ID</th>
                <th className="px-5 py-3 text-left">Name / Target</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-right">Hosts</th>
                <th className="px-5 py-3 text-right">Ports</th>
                <th className="px-5 py-3 text-right">Rate</th>
                <th className="px-5 py-3 text-right">Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {scans.map((s) => (
                <tr key={s.id} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-3 font-mono text-gray-400">#{s.id}</td>
                  <td className="px-5 py-3">
                    <p className="text-gray-100 text-xs">{s.name || <span className="text-gray-500">—</span>}</p>
                    <p className="font-mono text-gray-400 text-xs mt-0.5">{s.targets}</p>
                  </td>
                  <td className="px-5 py-3"><Badge status={s.status} /></td>
                  <td className="px-5 py-3 text-right tabular-nums text-gray-300">{s.hosts_count}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-gray-300">{s.ports_count}</td>
                  <td className="px-5 py-3 text-right text-gray-500 text-xs font-mono">{s.rate.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right text-gray-500 text-xs">{formatDate(s.created_at)}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        to={`/scans/${s.id}`}
                        className="text-xs text-green-400 hover:text-green-300"
                      >
                        View →
                      </Link>
                      <button
                        onClick={() => remove(s.id)}
                        disabled={deleting === s.id}
                        className="text-gray-600 hover:text-red-400 transition-colors disabled:opacity-40"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
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
