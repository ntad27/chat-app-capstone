import { create } from 'zustand'
import type { Artifact } from '../types/events'

export type MessageRole = 'user' | 'assistant' | 'system' | 'error'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: number
  artifacts?: Artifact[]
}

interface ChatState {
  messages: ChatMessage[]
  pendingQuestion: { question: string; requestId: string } | null
  activityText: string
  addUserMessage: (content: string) => void
  addAssistantMessage: (content: string, artifacts?: Artifact[]) => void
  addSystemMessage: (content: string) => void
  addErrorMessage: (message: string, agentName: string) => void
  setPendingQuestion: (question: string, requestId: string) => void
  clearPendingQuestion: () => void
  updateActivity: (text: string) => void
  reset: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  pendingQuestion: null,
  activityText: '',

  addUserMessage: (content) =>
    set((state) => ({
      messages: [...state.messages, {
        id: crypto.randomUUID(),
        role: 'user' as const,
        content,
        timestamp: Date.now(),
      }],
    })),

  addAssistantMessage: (content, artifacts) =>
    set((state) => ({
      messages: [...state.messages, {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content,
        timestamp: Date.now(),
        artifacts,
      }],
    })),

  addSystemMessage: (content) =>
    set((state) => ({
      messages: [...state.messages, {
        id: crypto.randomUUID(),
        role: 'system' as const,
        content,
        timestamp: Date.now(),
      }],
    })),

  addErrorMessage: (message, agentName) =>
    set((state) => ({
      messages: [...state.messages, {
        id: crypto.randomUUID(),
        role: 'error' as const,
        content: `[${agentName}] ${message}`,
        timestamp: Date.now(),
      }],
    })),

  setPendingQuestion: (question, requestId) =>
    set((state) => ({
      pendingQuestion: { question, requestId },
      messages: [...state.messages, {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: question,
        timestamp: Date.now(),
      }],
    })),

  clearPendingQuestion: () => set({ pendingQuestion: null }),
  updateActivity: (text) => set({ activityText: text }),
  reset: () => set({ messages: [], pendingQuestion: null, activityText: '' }),
}))
