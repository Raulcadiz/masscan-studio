export default function StatsCard({ label, value, icon: Icon, accent = 'text-green-400', sub }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-start gap-4">
      {Icon && (
        <div className="p-2 rounded-lg bg-gray-800">
          <Icon size={18} className={accent} />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-100 tabular-nums">{value ?? '—'}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-600 mt-1 truncate">{sub}</p>}
      </div>
    </div>
  )
}
