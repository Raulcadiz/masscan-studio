const variants = {
  pending:   'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  running:   'bg-blue-500/15   text-blue-400   border border-blue-500/30   animate-pulse',
  completed: 'bg-green-500/15  text-green-400  border border-green-500/30',
  failed:    'bg-red-500/15    text-red-400    border border-red-500/30',
  open:      'bg-green-500/15  text-green-400  border border-green-500/25',
  closed:    'bg-gray-700/50   text-gray-500   border border-gray-700',
}

export default function Badge({ status, className = '' }) {
  const cls = variants[status] ?? variants.closed
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cls} ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status}
    </span>
  )
}
