import { useTraceStore } from '../../stores/trace-store'
import { StatusBadge } from './StatusBadge'
import { ParallelGroup } from './ParallelGroup'

function str(val: unknown): string {
  return typeof val === 'string' ? val : JSON.stringify(val) ?? ''
}

interface Props {
  nodeId: string
  depth: number
}

export function TraceNode({ nodeId, depth }: Props) {
  const node = useTraceStore((s) => s.tree.nodes[nodeId])
  const isExpanded = useTraceStore((s) => s.expandedIds.has(nodeId))
  const toggleExpand = useTraceStore((s) => s.toggleExpand)

  if (!node) return null

  const hasChildren = node.children.length > 0

  // Detect parallel: multiple agent children
  const allNodes = useTraceStore.getState().tree.nodes
  const agentChildren = node.children.filter((id) => allNodes[id]?.type === 'agent')
  const nonAgentChildren = node.children.filter((id) => allNodes[id]?.type !== 'agent')
  const hasParallelAgents = agentChildren.length > 1

  const duration = node.endTime
    ? ((node.endTime - node.startTime) / 1000).toFixed(1)
    : null

  return (
    <div style={{ marginLeft: depth > 0 ? 12 : 0 }}>
      {/* Node header */}
      <div
        className="flex items-center gap-1.5 py-1 px-1.5 cursor-pointer hover:bg-gray-800/50 rounded text-sm group"
        onClick={() => hasChildren && toggleExpand(nodeId)}
      >
        {hasChildren ? (
          <span className="text-gray-500 text-[10px] w-3 text-center">
            {isExpanded ? '\u25BC' : '\u25B6'}
          </span>
        ) : (
          <span className="w-3" />
        )}
        <StatusBadge status={node.status} />
        <span className="font-medium text-gray-200">{node.label}</span>
        {node.type === 'agent' && (
          <span className="text-xs text-gray-500">({node.agentRole})</span>
        )}
        {node.type === 'tool' && node.status === 'running' && (
          <span className="text-xs text-blue-400 animate-pulse ml-1">running</span>
        )}
        {duration && (
          <span className="text-xs text-gray-600 ml-auto">{duration}s</span>
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="ml-3 border-l border-gray-800 pl-2">
          {/* Thinking text */}
          {node.type === 'thinking' && str(node.data.text) !== '' && (
            <pre className="text-xs text-gray-400 bg-gray-900/50 px-2 py-1.5 rounded mt-1 whitespace-pre-wrap max-h-32 overflow-auto">
              {str(node.data.text)}
            </pre>
          )}

          {/* Tool input/output */}
          {node.type === 'tool' && (
            <div className="text-xs mt-1 space-y-1">
              {node.data.input != null && (
                <details className="group/detail">
                  <summary className="text-gray-500 cursor-pointer hover:text-gray-400">Input</summary>
                  <pre className="bg-gray-900/50 px-2 py-1 rounded text-gray-400 mt-0.5">
                    {str(node.data.input)}
                  </pre>
                </details>
              )}
              {str(node.data.output) !== '' && (
                <details className="group/detail">
                  <summary className="text-gray-500 cursor-pointer hover:text-gray-400">Output</summary>
                  <pre className="bg-gray-900/50 px-2 py-1 rounded text-gray-400 mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap">
                    {str(node.data.output)}
                  </pre>
                </details>
              )}
              {str(node.data.error) !== '' && (
                <div className="text-red-400 bg-red-950/30 px-2 py-1 rounded">
                  {'Error: '}{str(node.data.error)}
                </div>
              )}
            </div>
          )}

          {/* ask_user question */}
          {node.type === 'ask_user' && (
            <div className="text-xs text-amber-400 bg-amber-950/30 px-2 py-1.5 rounded mt-1 border border-amber-800/30">
              {str(node.data.question)}
            </div>
          )}

          {/* Response text */}
          {node.type === 'response' && str(node.data.text) !== '' && (
            <pre className="text-xs text-gray-300 bg-gray-900/50 px-2 py-1.5 rounded mt-1 whitespace-pre-wrap max-h-40 overflow-auto">
              {str(node.data.text)}
            </pre>
          )}

          {/* Artifacts */}
          {node.artifacts.length > 0 && (
            <div className="mt-1 space-y-1">
              {node.artifacts.map((artifact, i) => (
                <details key={i} className="bg-gray-900 border border-gray-700 rounded">
                  <summary className="px-2 py-1 text-xs text-blue-400 cursor-pointer">
                    {artifact.name}
                  </summary>
                  <pre className="px-2 py-1 text-xs text-gray-400 max-h-48 overflow-auto whitespace-pre-wrap">
                    {artifact.content}
                  </pre>
                </details>
              ))}
            </div>
          )}

          {/* Parallel agent children */}
          {hasParallelAgents && <ParallelGroup nodeIds={agentChildren} />}

          {/* Non-parallel children (tools, thinking, etc) */}
          {nonAgentChildren.map((childId) => (
            <TraceNode key={childId} nodeId={childId} depth={depth + 1} />
          ))}

          {/* Single agent children (not parallel) */}
          {!hasParallelAgents && agentChildren.map((childId) => (
            <TraceNode key={childId} nodeId={childId} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}
