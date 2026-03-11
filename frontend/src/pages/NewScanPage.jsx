import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, Info, Globe, BookMarked, Save, Trash2, ChevronDown, Clock } from 'lucide-react'
import { api } from '../api/client'
import Spinner from '../components/ui/Spinner'
import COUNTRY_IPS from '../data/country_ips.json'
import { estimateScanSeconds, countTargetIPs, formatETA } from '../utils/scanEstimate'

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

const LS_KEY = 'masscan_profiles'

function loadProfiles() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
function saveProfiles(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list))
}

const COUNTRY_LIST = Object.entries(COUNTRY_IPS)
  .map(([code, { name, flag }]) => ({ code, name, flag }))
  .sort((a, b) => a.name.localeCompare(b.name))

// Target mode tabs
const TARGET_MODES = [
  { key: 'manual',  label: 'Manual',         icon: null },
  { key: 'country', label: 'By Country',      icon: Globe },
  { key: 'profile', label: 'Saved Profiles',  icon: BookMarked },
]

export default function NewScanPage() {
  const navigate = useNavigate()
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)
  const [preset, setPreset]         = useState('common')
  const [targetMode, setTargetMode] = useState('manual')

  // Country selector state
  const [countrySearch, setCountrySearch] = useState('')
  const [selectedCountry, setSelectedCountry]   = useState(null)
  const [countryDropOpen, setCountryDropOpen]   = useState(false)

  // Profile state
  const [profiles, setProfiles]       = useState(loadProfiles)
  const [profileName, setProfileName] = useState('')

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

  // ── Country helpers ────────────────────────────────────────────────────────

  const filteredCountries = countrySearch
    ? COUNTRY_LIST.filter(c =>
        c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
        c.code.toLowerCase().includes(countrySearch.toLowerCase())
      )
    : COUNTRY_LIST

  function pickCountry(country) {
    const cidrs = COUNTRY_IPS[country.code].cidrs
    setSelectedCountry(country)
    setCountryDropOpen(false)
    setCountrySearch('')
    set('targets', cidrs.join(' '))
  }

  // ── Profile helpers ────────────────────────────────────────────────────────

  function saveProfile() {
    if (!profileName.trim() || !form.targets) return
    const newProfile = {
      id: Date.now().toString(),
      name: profileName.trim(),
      targets: form.targets,
      ports: form.ports,
    }
    const updated = [newProfile, ...profiles]
    setProfiles(updated)
    saveProfiles(updated)
    setProfileName('')
  }

  function loadProfile(profile) {
    set('targets', profile.targets)
    set('ports', profile.ports)
    setPreset('custom')
    setTargetMode('manual')
  }

  function deleteProfile(id) {
    const updated = profiles.filter(p => p.id !== id)
    setProfiles(updated)
    saveProfiles(updated)
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function submit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const scan = await api.createScan({ ...form, rate: Number(form.rate) })
      navigate(`/scans/${scan.id}`)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

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

        {/* Target — mode tabs */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Target <span className="text-red-400">*</span>
          </label>

          {/* Tab selector */}
          <div className="flex gap-1 mb-3 bg-gray-900 border border-gray-800 rounded-lg p-1">
            {TARGET_MODES.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTargetMode(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md transition-colors ${
                  targetMode === key
                    ? 'bg-gray-700 text-gray-100'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {Icon && <Icon size={12} />}
                {label}
              </button>
            ))}
          </div>

          {/* Manual */}
          {targetMode === 'manual' && (
            <input
              type="text"
              required
              placeholder="192.168.1.0/24  or  10.0.0.1-10.0.0.50"
              value={form.targets}
              onChange={(e) => set('targets', e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500/60"
            />
          )}

          {/* Country */}
          {targetMode === 'country' && (
            <div className="space-y-2">
              {/* Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setCountryDropOpen(o => !o)}
                  className="w-full flex items-center justify-between bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-green-500/60"
                >
                  {selectedCountry
                    ? <span>{selectedCountry.flag} {selectedCountry.name}</span>
                    : <span className="text-gray-500">Select a country…</span>
                  }
                  <ChevronDown size={14} className="text-gray-500" />
                </button>

                {countryDropOpen && (
                  <div className="absolute z-20 mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg shadow-xl">
                    <div className="p-2 border-b border-gray-800">
                      <input
                        autoFocus
                        type="text"
                        placeholder="Search country…"
                        value={countrySearch}
                        onChange={e => setCountrySearch(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none"
                      />
                    </div>
                    <ul className="max-h-48 overflow-y-auto py-1">
                      {filteredCountries.map(c => (
                        <li key={c.code}>
                          <button
                            type="button"
                            onClick={() => pickCountry(c)}
                            className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-800 flex items-center gap-2"
                          >
                            <span>{c.flag}</span>
                            <span>{c.name}</span>
                            <span className="ml-auto text-xs text-gray-600">{c.code}</span>
                          </button>
                        </li>
                      ))}
                      {filteredCountries.length === 0 && (
                        <li className="px-3 py-2 text-sm text-gray-600">No results</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>

              {/* Info badge */}
              {selectedCountry && (
                <div className="flex items-center gap-2 text-xs text-yellow-400/80 bg-yellow-400/5 border border-yellow-400/20 rounded-lg px-3 py-2">
                  <Info size={12} />
                  <span>
                    <span className="font-medium">{COUNTRY_IPS[selectedCountry.code].cidrs.length} CIDRs</span> loaded for {selectedCountry.name}.
                    Scanning a full country may take a very long time.
                  </span>
                </div>
              )}

              {/* Hidden required input so form validation works */}
              <input type="text" required value={form.targets} readOnly className="sr-only" tabIndex={-1} />
            </div>
          )}

          {/* Profiles */}
          {targetMode === 'profile' && (
            <div>
              {profiles.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">
                  No saved profiles yet. Fill in targets + ports and save below.
                </p>
              ) : (
                <ul className="space-y-2">
                  {profiles.map(p => (
                    <li key={p.id} className="flex items-start gap-3 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-200 truncate">{p.name}</p>
                        <p className="text-xs text-gray-500 font-mono truncate mt-0.5">{p.targets}</p>
                        <p className="text-xs text-gray-600 font-mono truncate">{p.ports}</p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => loadProfile(p)}
                          className="text-xs px-2 py-1 rounded bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors"
                        >
                          Load
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteProfile(p.id)}
                          className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {/* Still need a target for the form — remind user to go to manual */}
              <input type="text" required value={form.targets} readOnly className="sr-only" tabIndex={-1} />
            </div>
          )}

          {/* Save as profile (visible in manual + country mode) */}
          {targetMode !== 'profile' && form.targets && (
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                placeholder="Profile name…"
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500/60"
              />
              <button
                type="button"
                onClick={saveProfile}
                disabled={!profileName.trim()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:border-green-500/40 hover:text-green-400 disabled:opacity-40 transition-colors"
              >
                <Save size={12} /> Save
              </button>
            </div>
          )}
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

        {/* Scan estimate */}
        {form.targets && (() => {
          const secs = estimateScanSeconds(form.targets, form.ports, form.rate)
          const ips  = countTargetIPs(form.targets)
          const eta  = formatETA(secs)
          const warn = secs > 3600
          return eta ? (
            <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${
              warn
                ? 'bg-yellow-400/5 border-yellow-400/20 text-yellow-400/80'
                : 'bg-gray-900 border-gray-800 text-gray-500'
            }`}>
              <Clock size={12} className="shrink-0" />
              <span>
                Estimated duration: <span className="font-semibold">{eta}</span>
                {' · '}{ips.toLocaleString()} IPs at {Number(form.rate).toLocaleString()} pps
                {warn && ' — Consider increasing the rate or scanning fewer ranges.'}
              </span>
            </div>
          ) : null
        })()}

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
