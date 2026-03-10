import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Plus,
  List,
  GitCompareArrows,
  Scan,
} from 'lucide-react'

const NAV = [
  { to: '/',          label: 'Dashboard',  Icon: LayoutDashboard, end: true },
  { to: '/scans/new', label: 'New Scan',   Icon: Plus },
  { to: '/scans',     label: 'All Scans',  Icon: List },
  { to: '/compare',   label: 'Comparator', Icon: GitCompareArrows },
]

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
        <Scan size={18} className="text-green-400" />
        <span className="font-bold tracking-wide text-sm">
          MASSCAN <span className="text-green-400">STUDIO</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
              }`
            }
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-3 border-t border-gray-800 text-xs text-gray-600">
        v0.1.0 — Masscan Studio
      </div>
    </aside>
  )
}
