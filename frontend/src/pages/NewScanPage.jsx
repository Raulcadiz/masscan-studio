import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, Info } from 'lucide-react'
import { api } from '../api/client'
import Spinner from '../components/ui/Spinner'

const PORT_PRESETS = {
  common: '21,22,23,25,53,80,110,135,139,143,443,445,993,995,1433,3306,3389,5900,8080,8443',
  web:    '80,443,8080,8443,8000,8888,3000,3001,4000,5000,5001',
  smb:    '135,137,138,139,445',
  db:     '1433,1521,3306,5432,6379,27017',
  custom: '',
}

const PRESET_LABELS = {
  common: 'Common (20)',
  web:    'Web',
  smb:    'SMB / Windows',
  db:     'Databases',
  custom: 'Custom',
}

export default function NewScanPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [preset, setPreset] = useState('common')

  const [form, setForm] = useState({
    name: '',
    targets: '',
    ports: PORT_PRESETS.common,
    rate: 1000,
    nmap_enabled: false,
  })

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }))
  }

  function selectPreset(key) {
    setPreset(key)
    if (key !== 'custom') set('ports', PORT_PRESETS[key])
  }

  async function submit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const scan = await api.createScan({
        ...form,
        rate: Number(form.rate),
      })
      navigate(`/scans/${scan.id}`)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-gray-100 mb-1">New Scan</h1>
      <p className="text-sm text-gray-500 mb-6">
        Configure and launch a Masscan network scan. Only scan networks you own or have authorization for.
      </p>

      {error && (
        <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-5">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Name <span className="text-gray-600">(optional)</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Internal network — Monday"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500/60"
          />
        </div>

        {/* Target */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Target <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="192.168.1.0/24  or  10.0.0.1-10.0.0.50"
            value={form.targets}
            onChange={(e) => set('targets', e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500/60"
          />
        </div>

        {/* Port presets */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Port Preset
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {Object.entries(PRESET_LABELS).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => selectPreset(key)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  preset === key
                    ? 'bg-green-500/15 text-green-400 border-green-500/40'
                    : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="text"
            required
            placeholder="21,22,80,443,8080-8090"
            value={form.ports}
            onChange={(e) => { setPreset('custom'); set('ports', e.target.value) }}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500/60"
          />
        </div>

        {/* Rate */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Scan Rate — <span className="text-gray-300 font-mono">{Number(form.rate).toLocaleString()} pps</span>
          </label>
          <input
            type="range"
            min={100}
            max={10000}
            step={100}
            value={form.rate}
            onChange={(e) => set('rate', e.target.value)}
            className="w-full accent-green-400"
          />
          <div className="flex justify-between text-xs text-gray-600 mt-1">
            <span>100 (safe)</span>
            <span>10,000 (fast)</span>
          </div>
        </div>

        {/* Nmap */}
        <div className="flex items-start gap-3 bg-gray-900 border border-gray-800 rounded-xl p-4">
          <input
            id="nmap"
            type="checkbox"
            checked={form.nmap_enabled}
            onChange={(e) => set('nmap_enabled', e.target.checked)}
            className="mt-0.5 accent-green-400 w-4 h-4"
          />
          <div>
            <label htmlFor="nmap" className="text-sm font-medium text-gray-200 cursor-pointer">
              Enable Nmap service detection
            </label>
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
              <Info size={11} />
              Runs nmap -sV after masscan. Slower but identifies services and versions.
            </p>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-gray-950 font-semibold py-2.5 rounded-lg transition-colors text-sm"
        >
          {loading ? <Spinner size={16} /> : <Play size={15} />}
          {loading ? 'Starting scan…' : 'Launch Scan'}
        </button>
      </form>
    </div>
  )
}
