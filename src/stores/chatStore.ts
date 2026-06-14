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

  function findSession(id: string): ChatSession | null {
    return sessions.value.find((s) => s.id === id) ?? null
  }

  function getMessage(sessionId: string, messageId: string): Message | null {
    return findSession(sessionId)?.messages.find((m) => m.id === messageId) ?? null
  }

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
    const first = sessions.value[0]
    if (first) activeSessionId.value = first.id
  }

  const activeSession = computed(() => activeSessionId.value ? findSession(activeSessionId.value) : null)

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
        const first = sessions.value[0]
        if (first) activeSessionId.value = first.id
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

  function setSessionPersona(sessionId: string, personaId: string | null) {
    const session = findSession(sessionId)
    if (!session) return
    session.personaId = personaId
    session.updatedAt = Date.now()
  }

  function addMessageToSession(
    sessionId: string,
    msg: Omit<Message, 'id' | 'timestamp'>
  ): Message {
    const session = findSession(sessionId)
    if (!session) throw new Error('No session')
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

  function addMessage(msg: Omit<Message, 'id' | 'timestamp'>): Message {
    const session = activeSession.value
    if (!session) throw new Error('No active session')
    return addMessageToSession(session.id, msg)
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

  function deleteMessageFromSession(sessionId: string, messageId: string) {
    const session = findSession(sessionId)
    if (!session) return
    session.messages = session.messages.filter((m) => m.id !== messageId)
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

  function appendToMessage(sessionId: string, messageId: string, chunk: string) {
    const session = findSession(sessionId)
    const message = getMessage(sessionId, messageId)
    if (session && message?.role === 'assistant') {
      message.content += chunk
      session.updatedAt = Date.now()
    }
  }

  function appendReasoningToMessage(sessionId: string, messageId: string, chunk: string) {
    const session = findSession(sessionId)
    const message = getMessage(sessionId, messageId)
    if (session && message?.role === 'assistant') {
      message.reasoning = (message.reasoning ?? '') + chunk
      session.updatedAt = Date.now()
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
    findSession,
    getMessage,
    setActiveSession,
    createNewSession,
    deleteSession,
    renameSession,
    setSessionPersona,
    addMessage,
    addMessageToSession,
    updateMessage,
    deleteMessage,
    deleteMessageFromSession,
    truncateFrom,
    appendToMessage,
    appendReasoningToMessage,
  }
})
