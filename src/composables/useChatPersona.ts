import { computed } from 'vue'
import { useChatStore } from '../stores/chatStore'
import { usePersonaStore } from '../stores/personaStore'

/**
 * 現在のセッションに紐づくペルソナと、TTS用のペルソナIDを解決する。
 * MessageBubble / VNMode が共有する。
 */
export function useChatPersona() {
  const chatStore = useChatStore()
  const personaStore = usePersonaStore()

  const persona = computed(() =>
    personaStore.getPersonaById(chatStore.activeSession?.personaId) ?? personaStore.activePersona
  )

  const ttsPersonaId = computed(() => chatStore.activeSession?.personaId)

  return { persona, ttsPersonaId }
}
