import { ConnectionStatus } from './ConnectionStatus'
import { ChatPanel } from './chat/ChatPanel'
import { TracePanel } from './trace/TracePanel'

export function Layout() {
  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      <ConnectionStatus />
      <div className="flex-1 flex overflow-hidden">
        <div className="w-[40%] min-w-[320px] border-r border-gray-800 flex flex-col">
          <ChatPanel />
        </div>
        <div className="w-[60%] min-w-[400px] flex flex-col">
          <TracePanel />
        </div>
      </div>
    </div>
  )
}
