import { create } from 'zustand'
import type { TraceTree } from '../types/trace'
import type { NormalizedEvent, Artifact } from '../types/events'
import { applyEventToTree } from '../lib/tree-builder'

interface TraceState {
  tree: TraceTree
  expandedIds: Set<string>
  applyEvent: (event: NormalizedEvent) => void
  toggleExpand: (nodeId: string) => void
  expandAll: () => void
  collapseAll: () => void
  addArtifact: (nodeId: string, artifact: Artifact) => void
  reset: () => void
}

const emptyTree = (): TraceTree => ({ rootId: null, nodes: {} })

export const useTraceStore = create<TraceState>((set, get) => ({
  tree: emptyTree(),
  expandedIds: new Set<string>(),

  applyEvent: (event) => {
    const tree = structuredClone(get().tree)
    applyEventToTree(tree, event)

    const expandedIds = new Set(get().expandedIds)
    if (event.type === 'session_start') {
      expandedIds.add(event.id)
    } else if (event.type === 'subagent_start') {
      expandedIds.add(event.data.tool_use_id)
    }

    set({ tree, expandedIds })
  },

  toggleExpand: (nodeId) => {
    const expandedIds = new Set(get().expandedIds)
    if (expandedIds.has(nodeId)) {
      expandedIds.delete(nodeId)
    } else {
      expandedIds.add(nodeId)
    }
    set({ expandedIds })
  },

  expandAll: () => {
    const expandedIds = new Set(Object.keys(get().tree.nodes))
    set({ expandedIds })
  },

  collapseAll: () => set({ expandedIds: new Set() }),

  addArtifact: (nodeId, artifact) => {
    const tree = structuredClone(get().tree)
    const node = tree.nodes[nodeId]
    if (node) node.artifacts.push(artifact)
    set({ tree })
  },

  reset: () => set({ tree: emptyTree(), expandedIds: new Set() }),
}))
