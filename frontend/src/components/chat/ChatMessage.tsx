import type { ChatMessage as ChatMessageType } from '../../stores/chat-store'

interface Props {
  message: ChatMessageType
}

export function ChatMessage({ message }: Props) {
  const { role, content, artifacts } = message

  if (role === 'system') {
    return (
      <div className="text-center text-xs text-gray-500 py-1">
        {content}
      </div>
    )
  }

  if (role === 'error') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] px-3 py-2 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">
          <span className="text-red-500 text-xs font-medium">Error: </span>
          {content}
        </div>
      </div>
    )
  }

  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] px-3 py-2 rounded-lg bg-blue-600 text-white text-sm">
          {content}
        </div>
      </div>
    )
  }

  // assistant
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] space-y-2">
        <div className="px-3 py-2 rounded-lg bg-gray-800 text-gray-200 text-sm whitespace-pre-wrap">
          {content}
        </div>
        {artifacts && artifacts.length > 0 && (
          <div className="space-y-1">
            {artifacts.map((artifact, i) => (
              <details key={i} className="bg-gray-900 border border-gray-700 rounded-lg">
                <summary className="px-3 py-1.5 text-xs text-gray-400 cursor-pointer hover:text-gray-300">
                  {artifact.name}
                </summary>
                <pre className="px-3 py-2 text-xs text-gray-300 overflow-auto max-h-60 whitespace-pre-wrap">
                  {artifact.content}
                </pre>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
