import { describe, it, expect, beforeEach } from 'vitest'
import { decodeEvent } from '../lib/decoder'
import { useTraceStore } from '../stores/trace-store'
import { useChatStore } from '../stores/chat-store'
import { useSessionStore } from '../stores/session-store'
import * as factory from './helpers/event-factory'

beforeEach(() => {
  useTraceStore.getState().reset()
  useChatStore.getState().reset()
  useSessionStore.getState().reset()
  factory.resetCounter()
})

describe('decodeEvent — event routing', () => {
  it('session_start sets session status to running', () => {
    decodeEvent(factory.makeSessionStart())
    expect(useSessionStore.getState().status).toBe('running')
  })

  it('session_start creates root trace node', () => {
    decodeEvent(factory.makeSessionStart())
    const tree = useTraceStore.getState().tree
    expect(tree.rootId).not.toBeNull()
    expect(Object.keys(tree.nodes)).toHaveLength(1)
  })

  it('thinking adds node to trace tree', () => {
    decodeEvent(factory.makeSessionStart())
    decodeEvent(factory.makeThinking())
    const tree = useTraceStore.getState().tree
    expect(Object.keys(tree.nodes).length).toBeGreaterThan(1)
  })

  it('tool_use_start updates activity text', () => {
    decodeEvent(factory.makeSessionStart())
    decodeEvent(factory.makeToolStart('t1', 'WebSearch'))
    expect(useChatStore.getState().activityText).toContain('WebSearch')
  })

  it('subagent_start updates activity with agent name', () => {
    decodeEvent(factory.makeSessionStart())
    decodeEvent(factory.makeToolStart('task-1', 'Task'))
    decodeEvent(factory.makeSubagentStart('web-researcher', 'r1', 'task-1'))
    expect(useChatStore.getState().activityText).toContain('web-researcher')
  })

  it('agent_response adds assistant message to chat', () => {
    decodeEvent(factory.makeSessionStart())
    decodeEvent(factory.makeAgentResponse('Research complete.'))
    const messages = useChatStore.getState().messages
    const assistant = messages.find((m) => m.role === 'assistant')
    expect(assistant?.content).toBe('Research complete.')
  })

  it('ask_user sets pending question and pauses session', () => {
    decodeEvent(factory.makeSessionStart())
    decodeEvent(factory.makeAskUser('What angle?', 'req-1'))
    expect(useChatStore.getState().pendingQuestion).toEqual({
      question: 'What angle?',
      requestId: 'req-1',
    })
    expect(useSessionStore.getState().status).toBe('paused')
  })

  it('error adds error message to chat', () => {
    decodeEvent(factory.makeSessionStart())
    decodeEvent(factory.makeError('Search failed'))
    const messages = useChatStore.getState().messages
    const error = messages.find((m) => m.role === 'error')
    expect(error?.content).toContain('Search failed')
  })

  it('unrecoverable error sets session to failed', () => {
    decodeEvent(factory.makeSessionStart())
    decodeEvent(factory.makeError('Fatal', false))
    expect(useSessionStore.getState().status).toBe('failed')
  })

  it('done sets session status to completed', () => {
    decodeEvent(factory.makeSessionStart())
    decodeEvent(factory.makeDone())
    expect(useSessionStore.getState().status).toBe('completed')
  })

  it('done adds system message to chat', () => {
    decodeEvent(factory.makeSessionStart())
    decodeEvent(factory.makeDone())
    const messages = useChatStore.getState().messages
    const system = messages.filter((m) => m.role === 'system')
    expect(system.length).toBeGreaterThanOrEqual(1)
  })
})
