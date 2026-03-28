import { describe, it, expect, beforeEach } from 'vitest'
import { applyEventToTree } from '../lib/tree-builder'
import type { TraceTree } from '../types/trace'
import * as factory from './helpers/event-factory'

let tree: TraceTree

beforeEach(() => {
  tree = { rootId: null, nodes: {} }
  factory.resetCounter()
})

describe('applyEventToTree', () => {
  it('creates root node on session_start', () => {
    applyEventToTree(tree, factory.makeSessionStart())
    expect(tree.rootId).not.toBeNull()
    expect(Object.keys(tree.nodes)).toHaveLength(1)
    expect(tree.nodes[tree.rootId!].type).toBe('agent')
    expect(tree.nodes[tree.rootId!].status).toBe('running')
  })

  it('nests tool under agent', () => {
    applyEventToTree(tree, factory.makeSessionStart())
    applyEventToTree(tree, factory.makeToolStart('t1', 'Task'))
    const root = tree.nodes[tree.rootId!]
    expect(root.children).toContain('t1')
    expect(tree.nodes['t1'].type).toBe('tool')
  })

  it('nests subagent under parent via parent_tool_use_id', () => {
    applyEventToTree(tree, factory.makeSessionStart())
    applyEventToTree(tree, factory.makeToolStart('task-1', 'Task'))
    applyEventToTree(tree, factory.makeSubagentStart('web-researcher', 'r1', 'task-1'))
    expect(tree.nodes['r1']).toBeDefined()
    expect(tree.nodes['r1'].type).toBe('agent')
    expect(tree.nodes['r1'].label).toBe('web-researcher')
  })

  it('handles 3 parallel subagents under same parent', () => {
    applyEventToTree(tree, factory.makeSessionStart())
    applyEventToTree(tree, factory.makeToolStart('task-1', 'Task'))
    applyEventToTree(tree, factory.makeSubagentStart('researcher-1', 'r1', 'task-1'))
    applyEventToTree(tree, factory.makeSubagentStart('researcher-2', 'r2', 'task-1'))
    applyEventToTree(tree, factory.makeSubagentStart('researcher-3', 'r3', 'task-1'))

    expect(tree.nodes['r1']).toBeDefined()
    expect(tree.nodes['r2']).toBeDefined()
    expect(tree.nodes['r3']).toBeDefined()

    expect(tree.nodes['r1'].status).toBe('running')
    expect(tree.nodes['r2'].status).toBe('running')
    expect(tree.nodes['r3'].status).toBe('running')
  })

  it('marks subagent completed on subagent_end', () => {
    applyEventToTree(tree, factory.makeSessionStart())
    applyEventToTree(tree, factory.makeToolStart('task-1', 'Task'))
    applyEventToTree(tree, factory.makeSubagentStart('web-researcher', 'r1', 'task-1'))
    applyEventToTree(tree, factory.makeSubagentEnd('web-researcher', 'completed'))
    expect(tree.nodes['r1'].status).toBe('completed')
  })

  it('marks tool completed on tool_use_end', () => {
    applyEventToTree(tree, factory.makeSessionStart())
    applyEventToTree(tree, factory.makeToolStart('t1', 'WebSearch'))
    applyEventToTree(tree, factory.makeToolEnd('t1', 'WebSearch'))
    expect(tree.nodes['t1'].status).toBe('completed')
  })

  it('handles sequential-after-parallel (data-analyst after researchers)', () => {
    applyEventToTree(tree, factory.makeSessionStart())
    applyEventToTree(tree, factory.makeToolStart('task-1', 'Task'))
    applyEventToTree(tree, factory.makeSubagentStart('researcher', 'r1', 'task-1'))
    applyEventToTree(tree, factory.makeSubagentStart('researcher', 'r2', 'task-1'))
    applyEventToTree(tree, factory.makeSubagentEnd('researcher', 'completed'))
    applyEventToTree(tree, factory.makeSubagentEnd('researcher', 'completed'))
    applyEventToTree(tree, factory.makeToolEnd('task-1', 'Task'))

    applyEventToTree(tree, factory.makeToolStart('task-2', 'Task'))
    applyEventToTree(tree, factory.makeSubagentStart('data-analyst', 'da1', 'task-2'))

    expect(tree.nodes['da1']).toBeDefined()
    expect(tree.nodes['da1'].type).toBe('agent')
    expect(tree.nodes['da1'].label).toBe('data-analyst')
  })
})
