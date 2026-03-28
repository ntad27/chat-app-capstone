interface Props {
  text: string
}

export function ActivityTicker({ text }: Props) {
  if (!text) return null

  return (
    <div className="px-4 py-1.5 bg-blue-950/30 text-blue-400 text-xs flex items-center gap-2 border-t border-gray-800">
      <span className="animate-pulse">●</span>
      <span className="truncate">{text}</span>
    </div>
  )
}
