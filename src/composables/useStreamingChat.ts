import { ref, readonly } from 'vue'
import { useChatStore } from '../stores/chatStore'
import { useSettingsStore } from '../stores/settingsStore'
import { streamChatCompletion } from '../services/llmApi'
import { useTts } from './useTts'
import type { LlmRequestMessage } from '../types'

export function useStreamingChat() {
  const chatStore = useChatStore()
  const settingsStore = useSettingsStore()
  const tts = useTts()
  const isGenerating = ref(false)
  const error = ref<string | null>(null)
  let abortController: AbortController | null = null

  function buildApiMessages(): LlmRequestMessage[] {
    const systemPrompt = settingsStore.resolvedSystemPrompt
    const msgs: LlmRequestMessage[] = []

    if (systemPrompt.trim()) {
      msgs.push({ role: 'system', content: systemPrompt })
    }

    for (const m of chatStore.activeMessages) {
      if (m.role === 'system') continue
      msgs.push({ role: m.role, content: m.content })
    }

    return msgs
  }

  async function sendMessage(userContent: string) {
    error.value = null
    chatStore.addMessage({ role: 'user', content: userContent })
    await generateAssistantResponse()
  }

  async function generateAssistantResponse() {
    error.value = null
    const apiMessages = buildApiMessages()

    chatStore.addMessage({ role: 'assistant', content: '' })

    abortController = new AbortController()
    isGenerating.value = true

    try {
      for await (const chunk of streamChatCompletion(
        settingsStore.apiEndpoint,
        apiMessages,
        abortController.signal
      )) {
        if (chunk.reasoning) chatStore.appendReasoningToLastAssistant(chunk.reasoning)
        if (chunk.content) chatStore.appendToLastAssistant(chunk.content)
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
        const msgs = chatStore.activeMessages
        const last = msgs[msgs.length - 1]
        if (last && last.role === 'assistant' && last.content === '') {
          chatStore.deleteMessage(last.id)
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

    if (msgs[idx].role === 'user') {
      // ユーザーメッセージは残して、その後ろだけ削除
      const next = msgs[idx + 1]
      if (next) chatStore.truncateFrom(next.id)
    } else {
      // アシスタントメッセージはそこから削除
      chatStore.truncateFrom(messageId)
    }
    await generateAssistantResponse()
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
