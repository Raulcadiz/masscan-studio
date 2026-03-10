import { useEffect, useState } from 'react'
import { GitCompareArrows } from 'lucide-react'
import { api } from '../api/client'
import DiffView from '../components/Comparator/DiffView'
import Spinner from '../components/ui/Spinner'

export default function ComparatorPage() {
  const [scans, setScans] = useState([])
  const [scanA, setScanA] = useState('')
  const [scanB, setScanB] = useState('')
  const [diff, setDiff] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [scansLoading, setScansLoading] = useState(true)

  useEffect(() => {
    api.listScans({ status: 'completed' })
      .then(setScans)
      .catch((e) => setError(e.message))
      .finally(() => setScansLoading(false))
  }, [])

  async function compare(e) {
    e.preventDefault()
    if (!scanA || !scanB) return
    if (scanA === scanB) {
      setError('Select two different scans')
      return
    }
    setError(null)
    setLoading(true)
    setDiff(null)
    try {
      const result = await api.compareScans(Number(scanA), Number(scanB))
      setDiff(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const selectClass =
    'bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-green-500/60 min-w-48'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-100">Scan Comparator</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Detect new hosts, closed ports, and infrastructure changes between two scans
        </p>
      </div>

      {/* Form */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        {scansLoading ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Spinner size={14} /> Loading completed scans…
          </div>
        ) : scans.length < 2 ? (
          <p className="text-gray-500 text-sm">
            You need at least 2 completed scans to use the comparator.
          </p>
        ) : (
          <form onSubmit={compare} className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Scan A (baseline)</label>
              <select
                value={scanA}
                onChange={(e) => setScanA(e.target.value)}
                className={selectClass}
                required
              >
                <option value="">Select scan…</option>
                {scans.map((s) => (
                  <option key={s.id} value={s.id}>
                    #{s.id} — {s.targets} ({s.hosts_count} hosts)
                  </option>
                ))}
              </select>
            </div>

            <div className="text-gray-600 pb-2">
              <GitCompareArrows size={20} />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Scan B (comparison)</label>
              <select
                value={scanB}
                onChange={(e) => setScanB(e.target.value)}
                className={selectClass}
                required
              >
                <option value="">Select scan…</option>
                {scans.map((s) => (
                  <option key={s.id} value={s.id}>
                    #{s.id} — {s.targets} ({s.hosts_count} hosts)
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={loading || !scanA || !scanB}
              className="flex items-center gap-2 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-gray-950 font-semibold text-sm px-5 py-2 rounded-lg transition-colors"
            >
              {loading ? <Spinner size={14} /> : <GitCompareArrows size={14} />}
              {loading ? 'Comparing…' : 'Compare'}
            </button>
          </form>
        )}

        {error && (
          <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-red-400 text-xs">
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {diff && <DiffView diff={diff} />}
    </div>
  )
}
