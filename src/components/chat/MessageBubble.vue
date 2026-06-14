<script setup lang="ts">
import { ref, nextTick, computed } from 'vue'
import { marked } from 'marked'
import type { Message } from '../../types'
import { useChatStore } from '../../stores/chatStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTts } from '../../composables/useTts'
import { useChatPersona } from '../../composables/useChatPersona'
import { parseThinking } from '../../utils/parseThinking'
import { sanitizeHtml } from '../../utils/sanitizeHtml'

marked.setOptions({
  breaks: true,
  gfm: true,
})

const props = defineProps<{
  message: Message
  isGenerating: boolean
}>()

const emit = defineEmits<{
  regenerate: [messageId: string]
}>()

const chatStore = useChatStore()
const { persona: activePersona, ttsPersonaId } = useChatPersona()

const isEditing = ref(false)
const editContent = ref('')
const editTextarea = ref<HTMLTextAreaElement | null>(null)

function startEdit() {
  editContent.value = props.message.content
  isEditing.value = true
  nextTick(() => {
    editTextarea.value?.focus()
    autoResize()
  })
}

function saveEdit() {
  if (editContent.value.trim() !== props.message.content) {
    chatStore.updateMessage(props.message.id, editContent.value.trim())
  }
  isEditing.value = false
}

function cancelEdit() {
  isEditing.value = false
}

function autoResize() {
  const el = editTextarea.value
  if (el) {
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }
}

const avatarUrl = computed(() => activePersona.value?.avatarUrl)
const avatarObjectPosition = computed(() => {
  const fp = activePersona.value?.avatarFocalPoint
  return fp ? `${fp.x}% ${fp.y}%` : '50% 50%'
})

// reasoning フィールドまたは <think> タグを分離する
const parsed = computed(() =>
  parseThinking(props.message.content, props.message.reasoning, props.isGenerating)
)

const renderedAnswer = computed(() => {
  const text = parsed.value.answer
  if (!text) return ''
  return sanitizeHtml(marked.parse(text) as string)
})

const showThinking = ref(false)
const { isPlaying: ttsPlaying, currentMessageId: ttsCurrentMessageId, speak: ttsSpeak, respeak: ttsRespeak, stop: ttsStop } = useTts()
const isTtsActive = computed(
  () => ttsPlaying.value && ttsCurrentMessageId.value === props.message.id
)
const settingsStore = useSettingsStore()
</script>

<template>
  <div class="message-bubble" :class="[message.role]">
    <div v-if="message.role === 'assistant'" class="avatar-col">
      <div class="avatar">
        <img
          v-if="avatarUrl"
          :src="avatarUrl"
          alt="avatar"
          class="avatar-img"
          :style="{ objectPosition: avatarObjectPosition }"
        />
        <div v-else class="avatar-placeholder">AI</div>
      </div>
      <template v-if="settingsStore.ttsEnabled && !isGenerating">
        <button
          class="tts-btn"
          :class="{ 'tts-btn--active': isTtsActive }"
          @click="isTtsActive ? ttsStop() : ttsSpeak(parsed.answer, message.id, ttsPersonaId)"
          :title="isTtsActive ? '停止' : '再生'"
        >
          <template v-if="isTtsActive">
            <span class="tts-waves"><span class="w"/><span class="w"/><span class="w"/></span>
          </template>
          <template v-else>▶</template>
        </button>
        <button
          class="tts-btn"
          @click="ttsRespeak(parsed.answer, message.id, ttsPersonaId)"
          title="再生成"
        >↺</button>
      </template>
    </div>

    <div class="message-body">
      <div v-if="isEditing" class="edit-area">
        <textarea
          ref="editTextarea"
          v-model="editContent"
          class="edit-textarea"
          @input="autoResize"
          @keydown.escape="cancelEdit"
        />
        <div class="edit-actions">
          <button class="btn-sm btn-primary" @click="saveEdit">保存</button>
          <button class="btn-sm" @click="cancelEdit">キャンセル</button>
        </div>
      </div>
      <template v-else>
        <!-- Thinking ブロック -->
        <div v-if="parsed.thinking !== null" class="thinking-block">
          <button class="thinking-toggle" @click="showThinking = !showThinking">
            <span class="thinking-icon">{{ parsed.streaming ? '⏳' : '💭' }}</span>
            <span>{{ parsed.streaming ? '思考中...' : '思考プロセス' }}</span>
            <span class="thinking-chevron">{{ showThinking ? '▲' : '▼' }}</span>
          </button>
          <div v-if="showThinking" class="thinking-content">
            <pre class="thinking-text">{{ parsed.thinking }}<span v-if="parsed.streaming && isGenerating" class="cursor-blink">▌</span></pre>
          </div>
        </div>
        <!-- 本文 -->
        <div
          v-if="message.role === 'assistant' && activePersona"
          class="speaker-name"
        >
          {{ activePersona.name }}
        </div>
        <div class="message-content markdown-body" v-html="renderedAnswer" />
        <span v-if="isGenerating && !parsed.streaming" class="cursor-blink">▌</span>

      </template>

      <div v-if="!isEditing && !isGenerating" class="message-actions">
        <button class="action-btn" @click="startEdit" title="編集">✎</button>
        <button
          class="action-btn"
          @click="chatStore.deleteMessage(message.id)"
          title="削除"
        >
          🗑
        </button>
        <button
          class="action-btn"
          @click="emit('regenerate', message.id)"
          title="ここから再生成"
        >
          ↻
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-bubble {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 4px;
}

.message-bubble.user {
  background: var(--msg-user-bg);
  margin-left: 40px;
}

.message-bubble.assistant {
  background: var(--msg-assistant-bg);
}

.avatar {
  width: 56px;
  height: 56px;
}

.avatar-img {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  object-fit: cover;
}

.avatar-placeholder {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  background: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}

.message-body {
  flex: 1;
  min-width: 0;
}

.message-content {
  word-break: break-word;
  font-size: 14px;
  line-height: 1.6;
}

.speaker-name {
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 4px;
}

/* Markdown styles */
.markdown-body :deep(p) {
  margin: 0.4em 0;
}

.markdown-body :deep(p:first-child) {
  margin-top: 0;
}

.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(pre) {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px;
  overflow-x: auto;
  margin: 8px 0;
}

.markdown-body :deep(code) {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
}

.markdown-body :deep(:not(pre) > code) {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 1px 4px;
  font-size: 0.9em;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 1.5em;
  margin: 0.4em 0;
}

.markdown-body :deep(blockquote) {
  border-left: 3px solid var(--accent);
  margin: 0.4em 0;
  padding: 4px 12px;
  color: var(--text-secondary);
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  margin: 0.6em 0 0.3em;
  line-height: 1.3;
}

.markdown-body :deep(h1) { font-size: 1.4em; }
.markdown-body :deep(h2) { font-size: 1.2em; }
.markdown-body :deep(h3) { font-size: 1.1em; }

.markdown-body :deep(table) {
  border-collapse: collapse;
  margin: 8px 0;
  width: 100%;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--border);
  padding: 6px 10px;
  text-align: left;
}

.markdown-body :deep(th) {
  background: var(--bg-primary);
  font-weight: 600;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--border);
  margin: 8px 0;
}

.markdown-body :deep(a) {
  color: var(--accent);
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(img) {
  max-width: 100%;
  border-radius: 6px;
}

.cursor-blink {
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  50% { opacity: 0; }
}

.message-actions {
  display: flex;
  gap: 4px;
  margin-top: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.message-bubble:hover .message-actions {
  opacity: 1;
}

.action-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 4px;
}

.action-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.edit-area {
  width: 100%;
}

.edit-textarea {
  width: 100%;
  background: var(--bg-primary);
  border: 1px solid var(--accent);
  border-radius: 6px;
  color: var(--text-primary);
  padding: 8px;
  font-size: 14px;
  font-family: inherit;
  resize: none;
  outline: none;
  box-sizing: border-box;
  line-height: 1.6;
}

.edit-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.btn-sm {
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 12px;
}

.btn-sm:hover {
  background: var(--border);
}

.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.btn-primary:hover {
  opacity: 0.9;
}

/* ── Thinking ブロック ── */
.thinking-block {
  margin-bottom: 8px;
}

.thinking-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  padding: 4px 10px;
  transition: background 0.15s;
}

.thinking-toggle:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.thinking-icon {
  font-size: 14px;
}

.thinking-chevron {
  margin-left: auto;
  font-size: 10px;
  padding-left: 8px;
}

.thinking-content {
  margin-top: 6px;
  border-left: 2px solid var(--border);
  padding-left: 12px;
}

.thinking-text {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  line-height: 1.6;
  margin: 0;
}

/* ── アバター列 ── */
.avatar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  width: 56px;
}

/* ── TTS ── */
.tts-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: none;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}
.tts-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}
.tts-btn--active {
  border-color: var(--accent);
  color: var(--accent);
}
.tts-btn--active:hover {
  background: rgba(124, 92, 191, 0.1);
}

.tts-waves {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
}
.w {
  display: inline-block;
  width: 2px;
  border-radius: 2px;
  background: var(--accent);
  animation: bar-wave 0.7s ease-in-out infinite;
}
.w:nth-child(1) { height: 4px;  animation-delay: 0s; }
.w:nth-child(2) { height: 10px; animation-delay: 0.15s; }
.w:nth-child(3) { height: 6px;  animation-delay: 0.3s; }

@keyframes bar-wave {
  0%, 100% { transform: scaleY(0.5); }
  50%       { transform: scaleY(1.3); }
}
</style>
