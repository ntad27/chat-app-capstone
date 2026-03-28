import { TraceNode } from './TraceNode'

interface Props {
  nodeIds: string[]
}

export function ParallelGroup({ nodeIds }: Props) {
  return (
    <div className="my-2">
      <div className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
        <span className="text-blue-400">||</span>
        <span>Running in parallel ({nodeIds.length} agents)</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {nodeIds.map((id) => (
          <div key={id} className="flex-1 min-w-[180px] border border-gray-700 rounded-lg p-2 bg-gray-900/50">
            <TraceNode nodeId={id} depth={0} />
          </div>
        ))}
      </div>
    </div>
  )
}
