import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { ChatSession, Message } from '../types'
import { generateId } from '../utils/id'

const SESSIONS_KEY = 'mychat_sessions'
const ACTIVE_KEY = 'mychat_activeSessionId'

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<ChatSession[]>(loadSessions())
  const activeSessionId = ref<string | null>(
    localStorage.getItem(ACTIVE_KEY)
  )

  function createNewSession(personaId: string | null = null): ChatSession {
    const session: ChatSession = {
      id: generateId(),
      name: 'New Chat',
      messages: [],
      personaId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    sessions.value.unshift(session)
    activeSessionId.value = session.id
    return session
  }

  if (sessions.value.length === 0) {
    createNewSession()
  }
  if (
    !activeSessionId.value ||
    !sessions.value.find((s) => s.id === activeSessionId.value)
  ) {
    activeSessionId.value = sessions.value[0].id
  }

  const activeSession = computed(() =>
    sessions.value.find((s) => s.id === activeSessionId.value) ?? null
  )

  const activeMessages = computed(() => activeSession.value?.messages ?? [])

  function setActiveSession(id: string) {
    activeSessionId.value = id
  }

  function deleteSession(id: string) {
    sessions.value = sessions.value.filter((s) => s.id !== id)
    if (activeSessionId.value === id) {
      if (sessions.value.length === 0) {
        createNewSession()
      } else {
        activeSessionId.value = sessions.value[0].id
      }
    }
  }

  function renameSession(id: string, name: string) {
    const session = sessions.value.find((s) => s.id === id)
    if (session) {
      session.name = name
      session.updatedAt = Date.now()
    }
  }

  function addMessage(msg: Omit<Message, 'id' | 'timestamp'>): Message {
    const session = activeSession.value
    if (!session) throw new Error('No active session')
    const message: Message = {
      id: generateId(),
      timestamp: Date.now(),
      ...msg,
    }
    session.messages.push(message)
    session.updatedAt = Date.now()

    // Auto-rename on first user message
    if (
      msg.role === 'user' &&
      session.name === 'New Chat' &&
      session.messages.filter((m) => m.role === 'user').length === 1
    ) {
      session.name = msg.content.slice(0, 30) + (msg.content.length > 30 ? '...' : '')
    }

    return message
  }

  function updateMessage(id: string, content: string) {
    const session = activeSession.value
    if (!session) return
    const msg = session.messages.find((m) => m.id === id)
    if (msg) {
      msg.content = content
      session.updatedAt = Date.now()
    }
  }

  function deleteMessage(id: string) {
    const session = activeSession.value
    if (!session) return
    session.messages = session.messages.filter((m) => m.id !== id)
    session.updatedAt = Date.now()
  }

  function truncateFrom(messageId: string) {
    const session = activeSession.value
    if (!session) return
    const idx = session.messages.findIndex((m) => m.id === messageId)
    if (idx !== -1) {
      session.messages.splice(idx)
      session.updatedAt = Date.now()
    }
  }

  function appendToLastAssistant(chunk: string) {
    const session = activeSession.value
    if (!session) return
    const msgs = session.messages
    const last = msgs[msgs.length - 1]
    if (last && last.role === 'assistant') {
      last.content += chunk
    }
  }

  function appendReasoningToLastAssistant(chunk: string) {
    const session = activeSession.value
    if (!session) return
    const msgs = session.messages
    const last = msgs[msgs.length - 1]
    if (last && last.role === 'assistant') {
      last.reasoning = (last.reasoning ?? '') + chunk
    }
  }

  // Persist (debounced)
  let saveTimeout: ReturnType<typeof setTimeout> | null = null
  watch(
    [sessions, activeSessionId],
    () => {
      if (saveTimeout) clearTimeout(saveTimeout)
      saveTimeout = setTimeout(() => {
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.value))
        if (activeSessionId.value) {
          localStorage.setItem(ACTIVE_KEY, activeSessionId.value)
        }
      }, 500)
    },
    { deep: true }
  )

  return {
    sessions,
    activeSessionId,
    activeSession,
    activeMessages,
    setActiveSession,
    createNewSession,
    deleteSession,
    renameSession,
    addMessage,
    updateMessage,
    deleteMessage,
    truncateFrom,
    appendToLastAssistant,
    appendReasoningToLastAssistant,
  }
})
