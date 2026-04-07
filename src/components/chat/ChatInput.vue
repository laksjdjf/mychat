<script setup lang="ts">
import { ref, nextTick } from 'vue'

const props = defineProps<{
  isGenerating: boolean
}>()

const emit = defineEmits<{
  send: [content: string]
  stop: []
}>()

const input = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)

function handleSend() {
  const content = input.value.trim()
  if (!content || props.isGenerating) return
  emit('send', content)
  input.value = ''
  nextTick(autoResize)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function autoResize() {
  const el = textarea.value
  if (el) {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }
}
</script>

<template>
  <div class="chat-input-wrapper">
    <div class="chat-input-container">
      <textarea
        ref="textarea"
        v-model="input"
        class="chat-textarea"
        placeholder="メッセージを入力... (Shift+Enterで送信)"
        rows="1"
        @keydown="handleKeydown"
        @input="autoResize"
        :disabled="isGenerating"
      />
      <button
        v-if="isGenerating"
        class="send-btn stop-btn"
        @click="emit('stop')"
        title="停止"
      >
        ■
      </button>
      <button
        v-else
        class="send-btn"
        @click="handleSend"
        :disabled="!input.trim()"
        title="送信"
      >
        ➤
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-input-wrapper {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg-secondary);
  flex-shrink: 0;
}

.chat-input-container {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  max-width: 800px;
  margin: 0 auto;
}

.chat-textarea {
  flex: 1;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  padding: 10px 14px;
  font-size: 14px;
  font-family: inherit;
  resize: none;
  outline: none;
  line-height: 1.5;
  max-height: 200px;
}

.chat-textarea:focus {
  border-color: var(--accent);
}

.chat-textarea:disabled {
  opacity: 0.6;
}

.send-btn {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  border: none;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.send-btn:not(:disabled):hover {
  opacity: 0.9;
}

.stop-btn {
  background: var(--danger);
  font-size: 14px;
}
</style>
