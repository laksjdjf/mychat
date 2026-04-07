<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useChatStore } from '../../stores/chatStore'
import MessageBubble from './MessageBubble.vue'

defineProps<{
  isGenerating: boolean
}>()

const emit = defineEmits<{
  regenerate: [messageId: string]
}>()

const chatStore = useChatStore()
const container = ref<HTMLElement | null>(null)

function isNearBottom(): boolean {
  const el = container.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < 100
}

function scrollToBottom() {
  nextTick(() => {
    const el = container.value
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  })
}

// Auto-scroll when new messages arrive or content updates
watch(
  () => chatStore.activeMessages.map((m) => m.content).join(''),
  () => {
    if (isNearBottom()) {
      scrollToBottom()
    }
  }
)

// Scroll to bottom on session switch
watch(
  () => chatStore.activeSessionId,
  () => scrollToBottom()
)
</script>

<template>
  <div ref="container" class="message-list">
    <div v-if="chatStore.activeMessages.length === 0" class="empty-state">
      メッセージを送信してチャットを開始しましょう
    </div>
    <MessageBubble
      v-for="msg in chatStore.activeMessages"
      :key="msg.id"
      :message="msg"
      :is-generating="isGenerating && msg.id === chatStore.activeMessages[chatStore.activeMessages.length - 1]?.id"
      @regenerate="emit('regenerate', $event)"
    />
  </div>
</template>

<style scoped>
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
  font-size: 14px;
}
</style>
