interface Props {
  label: string
  status: 'online' | 'offline' | 'loading'
}

export default function StatusBadge({ label, status }: Props) {
  const colors = {
    online: 'bg-green-500',
    offline: 'bg-red-500',
    loading: 'bg-yellow-500 animate-pulse',
  }
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${colors[status]}`} />
      <span className="text-sm text-gray-300">{label}</span>
    </div>
  )
}
