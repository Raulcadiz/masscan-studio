import { useState } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'

function PortTag({ port, service }) {
  const label = service ? `${port}/${service}` : String(port)
  return (
    <span
      title={service ?? ''}
      className="inline-block px-1.5 py-0.5 text-xs font-mono rounded bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors cursor-default"
    >
      {label}
    </span>
  )
}

function HostRow({ host }) {
  const [expanded, setExpanded] = useState(false)
  const Chevron = expanded ? ChevronDown : ChevronRight

  return (
    <>
      <tr
        className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-3 w-6">
          <Chevron size={14} className="text-gray-500" />
        </td>
        <td className="px-4 py-3 font-mono text-sm text-gray-100">{host.ip}</td>
        <td className="px-4 py-3 text-sm text-gray-400">{host.hostname ?? '—'}</td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {host.ports.slice(0, 8).map((p) => (
              <PortTag key={p.id} port={p.port} service={p.service} />
            ))}
            {host.ports.length > 8 && (
              <span className="text-xs text-gray-500 self-center">
                +{host.ports.length - 8} more
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-gray-500 text-right tabular-nums">
          {host.ports.length}
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-gray-800 bg-gray-900/50">
          <td colSpan={5} className="px-8 py-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500">
                  <th className="text-left pb-1 font-medium">Port</th>
                  <th className="text-left pb-1 font-medium">Proto</th>
                  <th className="text-left pb-1 font-medium">Service</th>
                  <th className="text-left pb-1 font-medium">Version</th>
                  <th className="text-left pb-1 font-medium">Banner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {host.ports.map((p) => (
                  <tr key={p.id}>
                    <td className="py-1 font-mono text-green-400">{p.port}</td>
                    <td className="py-1 text-gray-500">{p.protocol}</td>
                    <td className="py-1 text-gray-300">{p.service ?? '—'}</td>
                    <td className="py-1 text-gray-400">{p.version ?? '—'}</td>
                    <td className="py-1 text-gray-500 max-w-xs truncate">{p.banner ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  )
}

export default function HostTable({ hosts = [] }) {
  const [search, setSearch] = useState('')
  const [portFilter, setPortFilter] = useState('')

  const filtered = hosts.filter((h) => {
    const matchIp = h.ip.includes(search) || (h.hostname ?? '').includes(search)
    const matchPort = portFilter
      ? h.ports.some((p) => String(p.port) === portFilter)
      : true
    return matchIp && matchPort
  })

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search IP or hostname…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-green-500/50"
          />
        </div>
        <input
          type="number"
          placeholder="Filter port…"
          value={portFilter}
          onChange={(e) => setPortFilter(e.target.value)}
          className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-green-500/50"
        />
        <span className="self-center text-xs text-gray-500 ml-1">
          {filtered.length} host{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900/80 text-gray-500 text-xs uppercase tracking-wide">
              <th className="w-6 px-4 py-3" />
              <th className="px-4 py-3 text-left">IP Address</th>
              <th className="px-4 py-3 text-left">Hostname</th>
              <th className="px-4 py-3 text-left">Open Ports</th>
              <th className="px-4 py-3 text-right">Count</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-600">
                  No hosts found
                </td>
              </tr>
            ) : (
              filtered.map((h) => <HostRow key={h.id} host={h} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
