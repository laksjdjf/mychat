import { ref, readonly } from 'vue'
import { useChatStore } from '../stores/chatStore'
import { useSettingsStore } from '../stores/settingsStore'
import { usePersonaStore } from '../stores/personaStore'
import { streamChatCompletion } from '../services/llmApi'
import { useTts } from './useTts'
import type { LlmRequestMessage } from '../types'

export function useStreamingChat() {
  const chatStore = useChatStore()
  const settingsStore = useSettingsStore()
  const personaStore = usePersonaStore()
  const tts = useTts()
  const isGenerating = ref(false)
  const error = ref<string | null>(null)
  let abortController: AbortController | null = null

  function ensureSessionPersona(sessionId: string) {
    const session = chatStore.findSession(sessionId)
    if (session && !session.personaId) {
      chatStore.setSessionPersona(sessionId, personaStore.activePersonaId)
    }
  }

  function buildApiMessages(sessionId: string): LlmRequestMessage[] {
    const msgs: LlmRequestMessage[] = []
    const session = chatStore.findSession(sessionId)
    const systemPrompt = settingsStore.resolveSessionSystemPrompt(session)

    if (systemPrompt.trim()) {
      msgs.push({ role: 'system', content: systemPrompt })
    }

    for (const m of session?.messages ?? []) {
      if (m.role === 'system') continue
      msgs.push({ role: m.role, content: m.content })
    }

    return msgs
  }

  async function sendMessage(userContent: string) {
    error.value = null
    const sessionId = chatStore.activeSessionId
    if (!sessionId) return
    ensureSessionPersona(sessionId)
    chatStore.addMessage({ role: 'user', content: userContent })
    await generateAssistantResponse(sessionId)
  }

  async function generateAssistantResponse(sessionId = chatStore.activeSessionId) {
    if (!sessionId) return
    error.value = null
    ensureSessionPersona(sessionId)
    const apiMessages = buildApiMessages(sessionId)

    const assistantMessage = chatStore.addMessageToSession(sessionId, {
      role: 'assistant',
      content: '',
    })

    abortController = new AbortController()
    isGenerating.value = true

    try {
      for await (const chunk of streamChatCompletion(
        settingsStore.apiEndpoint,
        apiMessages,
        abortController.signal,
        settingsStore.generationParams
      )) {
        if (chunk.reasoning) {
          chatStore.appendReasoningToMessage(sessionId, assistantMessage.id, chunk.reasoning)
        }
        if (chunk.content) {
          chatStore.appendToMessage(sessionId, assistantMessage.id, chunk.content)
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        // User stopped - keep partial content
      } else {
        const msg = (e as Error).message
        if (msg === 'Failed to fetch' || msg.includes('NetworkError')) {
          error.value = `サーバーに接続できません (${settingsStore.apiEndpoint})。llama.cppサーバーが起動しているか確認してください。`
        } else {
          error.value = msg
        }
        // Remove empty assistant message on error
        const message = chatStore.getMessage(sessionId, assistantMessage.id)
        if (message?.role === 'assistant' && message.content === '') {
          chatStore.deleteMessageFromSession(sessionId, assistantMessage.id)
        }
      }
    } finally {
      isGenerating.value = false
      abortController = null
    }
  }

  function stopGeneration() {
    abortController?.abort()
    tts.stop()
  }

  async function regenerateFrom(messageId: string) {
    const msgs = chatStore.activeMessages
    const idx = msgs.findIndex((m) => m.id === messageId)
    if (idx === -1) return
    const message = msgs[idx]
    if (!message) return
    const sessionId = chatStore.activeSessionId

    if (message.role === 'user') {
      // ユーザーメッセージは残して、その後ろだけ削除
      const next = msgs[idx + 1]
      if (next) chatStore.truncateFrom(next.id)
    } else {
      // アシスタントメッセージはそこから削除
      chatStore.truncateFrom(messageId)
    }
    await generateAssistantResponse(sessionId)
  }

  return {
    isGenerating: readonly(isGenerating),
    error: readonly(error),
    sendMessage,
    stopGeneration,
    regenerateFrom,
    generateAssistantResponse,
  }
}
