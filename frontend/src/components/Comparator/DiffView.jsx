import { Plus, Minus, ArrowLeftRight } from 'lucide-react'

function Section({ title, icon: Icon, color, children }) {
  return (
    <div className="mb-6">
      <h3 className={`flex items-center gap-2 text-sm font-semibold mb-3 ${color}`}>
        <Icon size={14} />
        {title}
      </h3>
      <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
        {children}
      </div>
    </div>
  )
}

function HostRow({ ip, ports, type }) {
  const portColor = type === 'new' ? 'text-green-400 bg-green-500/10 border-green-500/20'
                                   : 'text-red-400 bg-red-500/10 border-red-500/20'
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <span className="font-mono text-sm text-gray-100 w-36 shrink-0">{ip}</span>
      {ports && (
        <div className="flex flex-wrap gap-1">
          {ports.map((p) => (
            <span
              key={p}
              className={`text-xs font-mono px-1.5 py-0.5 rounded border ${portColor}`}
            >
              {p}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function ChangedHostRow({ ip, newPorts, closedPorts }) {
  return (
    <div className="px-4 py-3">
      <p className="font-mono text-sm text-gray-100 mb-2">{ip}</p>
      <div className="flex flex-wrap gap-1">
        {newPorts?.map((p) => (
          <span
            key={`new-${p}`}
            className="text-xs font-mono px-1.5 py-0.5 rounded border text-green-400 bg-green-500/10 border-green-500/20"
          >
            +{p}
          </span>
        ))}
        {closedPorts?.map((p) => (
          <span
            key={`closed-${p}`}
            className="text-xs font-mono px-1.5 py-0.5 rounded border text-red-400 bg-red-500/10 border-red-500/20"
          >
            −{p}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function DiffView({ diff }) {
  const { summary, new_hosts, removed_hosts, new_ports, closed_ports, scan_a, scan_b } = diff

  // Build changed hosts: union of IPs in new_ports + closed_ports
  const changedIps = [
    ...new Set([...Object.keys(new_ports), ...Object.keys(closed_ports)]),
  ]

  return (
    <div>
      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'New Hosts',     value: summary.new_hosts_count,    color: 'text-green-400' },
          { label: 'Removed Hosts', value: summary.removed_hosts_count, color: 'text-red-400' },
          { label: 'New Ports',     value: summary.new_ports_total,     color: 'text-green-400' },
          { label: 'Closed Ports',  value: summary.closed_ports_total,  color: 'text-red-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* New hosts */}
      {new_hosts.length > 0 && (
        <Section title={`New Hosts (${new_hosts.length})`} icon={Plus} color="text-green-400">
          {new_hosts.map((ip) => (
            <HostRow key={ip} ip={ip} type="new" />
          ))}
        </Section>
      )}

      {/* Removed hosts */}
      {removed_hosts.length > 0 && (
        <Section title={`Removed Hosts (${removed_hosts.length})`} icon={Minus} color="text-red-400">
          {removed_hosts.map((ip) => (
            <HostRow key={ip} ip={ip} type="removed" />
          ))}
        </Section>
      )}

      {/* Changed ports */}
      {changedIps.length > 0 && (
        <Section title={`Changed Hosts (${changedIps.length})`} icon={ArrowLeftRight} color="text-yellow-400">
          {changedIps.map((ip) => (
            <ChangedHostRow
              key={ip}
              ip={ip}
              newPorts={new_ports[ip]}
              closedPorts={closed_ports[ip]}
            />
          ))}
        </Section>
      )}

      {/* No changes */}
      {!new_hosts.length && !removed_hosts.length && !changedIps.length && (
        <div className="text-center py-12 text-gray-500">
          No differences found between scan #{scan_a} and #{scan_b}
        </div>
      )}
    </div>
  )
}
