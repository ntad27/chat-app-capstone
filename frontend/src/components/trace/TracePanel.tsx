import { useTraceStore } from '../../stores/trace-store'
import { TraceNode } from './TraceNode'

export function TracePanel() {
  const tree = useTraceStore((s) => s.tree)
  const expandAll = useTraceStore((s) => s.expandAll)
  const collapseAll = useTraceStore((s) => s.collapseAll)

  const nodeCount = Object.keys(tree.nodes).length

  return (
    <div className="flex flex-col h-full bg-gray-950">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-300">Execution Trace</h2>
          {nodeCount > 0 && (
            <span className="text-xs text-gray-600">{nodeCount} nodes</span>
          )}
        </div>
        {nodeCount > 0 && (
          <div className="flex gap-2">
            <button
              onClick={expandAll}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Collapse All
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {tree.rootId ? (
          <TraceNode nodeId={tree.rootId} depth={0} />
        ) : (
          <div className="text-center text-gray-600 mt-12">
            <p className="text-sm">No trace yet</p>
            <p className="text-xs mt-1">Send a research query to see agent execution</p>
          </div>
        )}
      </div>
    </div>
  )
}
