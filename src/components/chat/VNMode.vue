<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import { useChatStore } from '../../stores/chatStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTts } from '../../composables/useTts'
import { useChatPersona } from '../../composables/useChatPersona'
import { parseThinking } from '../../utils/parseThinking'
import { marked } from 'marked'
import { sanitizeHtml } from '../../utils/sanitizeHtml'

marked.setOptions({ breaks: true, gfm: true })

const props = defineProps<{
  isGenerating: boolean
}>()

const emit = defineEmits<{
  send: [content: string]
  stop: []
}>()

const chatStore = useChatStore()
const { persona, ttsPersonaId } = useChatPersona()

// 最新のassistantメッセージ
const lastAssistant = computed(() => {
  const msgs = chatStore.activeMessages
  for (let i = msgs.length - 1; i >= 0; i--) {
    const msg = msgs[i]
    if (msg?.role === 'assistant') return msg
  }
  return null
})

// reasoning部分を除いた本文
const dialogueText = computed(() => {
  const msg = lastAssistant.value
  if (!msg) return ''
  return parseThinking(msg.content, msg.reasoning).answer || msg.content
})

const renderedDialogue = computed(() => {
  if (!dialogueText.value) return ''
  return sanitizeHtml(marked.parse(dialogueText.value) as string)
})

// 入力欄
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
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }
}

// 思考プロセス開閉
const showThinking = ref(false)
const hasThinking = computed(() => {
  const msg = lastAssistant.value
  if (!msg) return false
  return msg.reasoning !== undefined ? !!msg.reasoning : /^<think>|^<\|channel>thought/.test(msg.content)
})
const thinkingText = computed(() => {
  const msg = lastAssistant.value
  if (!msg) return ''
  if (msg.reasoning !== undefined) return msg.reasoning
  const thinkMatch = msg.content.match(/^<think>([\s\S]*?)(<\/think>|$)/)
  if (thinkMatch) return (thinkMatch[1] ?? '').trim()
  const channelMatch = msg.content.match(/^<\|channel>thought\n?([\s\S]*?)(<channel\|>|$)/)
  return channelMatch ? (channelMatch[1] ?? '').trim() : ''
})
const settingsStore = useSettingsStore()
const { isPlaying: ttsPlaying, currentMessageId: ttsCurrentMessageId, speak: ttsSpeak, respeak: ttsRespeak, stop: ttsStop } = useTts()
const isTtsActive = computed(
  () => ttsPlaying.value && lastAssistant.value != null && ttsCurrentMessageId.value === lastAssistant.value.id
)

const isThinkingStreaming = computed(() => {
  const msg = lastAssistant.value
  if (!msg) return false
  if (msg.reasoning !== undefined) return props.isGenerating && !msg.content
  return props.isGenerating && (
    /^<think>(?![\s\S]*<\/think>)/.test(msg.content) ||
    /^<\|channel>thought(?![\s\S]*<channel\|>)/.test(msg.content)
  )
})
</script>

<template>
  <div class="vn-mode">

    <!-- 画像セクション（flex:1 で残り全部）＋ダイアログを下端に重ねる -->
    <div class="image-section">
      <img
        v-if="persona?.avatarUrl"
        :src="persona.avatarUrl"
        class="bg-img"
        alt="avatar"
      />
      <div v-else class="bg-fallback">
        {{ persona?.name?.[0] ?? 'AI' }}
      </div>

      <!-- ダイアログは画像の下端に重ねる -->
      <div class="dialogue-area">
        <div v-if="hasThinking" class="thinking-row">
          <button class="thinking-toggle" @click="showThinking = !showThinking">
            {{ isThinkingStreaming ? '⏳ 思考中...' : '💭 思考プロセス' }}
            {{ showThinking ? '▲' : '▼' }}
          </button>
          <div v-if="showThinking" class="thinking-content">
            <pre class="thinking-text">{{ thinkingText }}<span v-if="isThinkingStreaming && isGenerating" class="cursor-blink">▌</span></pre>
          </div>
        </div>

        <div class="dialogue-box">
          <div class="dialogue-header">
            <div class="dialogue-name">{{ persona?.name ?? 'AI' }}</div>
            <div v-if="settingsStore.ttsEnabled && lastAssistant && !isGenerating" class="vn-tts-btns">
              <button
                class="vn-tts-btn"
                :class="{ 'vn-tts-btn--active': isTtsActive }"
                @click="isTtsActive ? ttsStop() : ttsSpeak(dialogueText, lastAssistant!.id, ttsPersonaId)"
              >
                <template v-if="isTtsActive">
                  <span class="tts-waves"><span class="w"/><span class="w"/><span class="w"/></span>
                </template>
                <template v-else>▶</template>
              </button>
              <button class="vn-tts-btn" @click="ttsRespeak(dialogueText, lastAssistant!.id, ttsPersonaId)" title="再生成">↺</button>
            </div>
          </div>
          <div
            v-if="lastAssistant"
            class="dialogue-text markdown-body"
            v-html="renderedDialogue"
          />
          <div v-else class="dialogue-placeholder">
            メッセージを送信してください
          </div>
          <span v-if="isGenerating && !isThinkingStreaming" class="cursor-blink">▌</span>
        </div>
      </div>
    </div>

    <!-- 入力欄（画像と完全に分離） -->
    <div class="vn-input-wrap">
      <div class="vn-input-container">
        <textarea
          ref="textarea"
          v-model="input"
          class="vn-textarea"
          placeholder="メッセージを入力... (Shift+Enterで送信)"
          rows="1"
          :disabled="isGenerating"
          @keydown="handleKeydown"
          @input="autoResize"
        />
        <button v-if="isGenerating" class="send-btn stop-btn" @click="emit('stop')">■</button>
        <button v-else class="send-btn" :disabled="!input.trim()" @click="handleSend">➤</button>
      </div>
    </div>

  </div>
</template>

<style scoped>
.vn-mode {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: #000;
}

/* 画像セクション：残り全部使う＋ダイアログの親 */
.image-section {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.bg-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: top center;
  display: block;
}

.bg-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  font-size: min(160px, 25vw);
  font-weight: 700;
  color: rgba(255, 255, 255, 0.2);
}

/* ── ダイアログエリア（画像の下端に重ねる） ── */
.dialogue-area {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 0 12px 12px;
}

.thinking-row {
  margin-bottom: 6px;
}

.thinking-toggle {
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  font-size: 11px;
  padding: 3px 10px;
}

.thinking-content {
  margin-top: 4px;
  border-left: 2px solid rgba(255, 255, 255, 0.2);
  padding-left: 10px;
  max-height: 25vh;
  overflow-y: auto;
}

.thinking-text {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  line-height: 1.5;
  margin: 0;
}

.dialogue-box {
  background: rgba(0, 0, 0, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 14px 16px;
  max-height: 30vh;
  overflow-y: auto;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.dialogue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.dialogue-name {
  font-size: 13px;
  font-weight: 700;
  color: #c4a8ff;
}

.vn-tts-btns {
  display: flex;
  gap: 4px;
}

.vn-tts-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 6px;
  background: none;
  color: rgba(255, 255, 255, 0.6);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}
.vn-tts-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.vn-tts-btn--active {
  border-color: #c4a8ff;
  color: #c4a8ff;
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
  background: #c4a8ff;
  animation: bar-wave 0.7s ease-in-out infinite;
}
.w:nth-child(1) { height: 4px;  animation-delay: 0s; }
.w:nth-child(2) { height: 10px; animation-delay: 0.15s; }
.w:nth-child(3) { height: 6px;  animation-delay: 0.3s; }

@keyframes bar-wave {
  0%, 100% { transform: scaleY(0.5); }
  50%       { transform: scaleY(1.3); }
}

.dialogue-text {
  font-size: 15px;
  line-height: 1.7;
  word-break: break-word;
  color: #fff;
}

.dialogue-placeholder {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.4);
}

.markdown-body :deep(p) { margin: 0.3em 0; }
.markdown-body :deep(p:first-child) { margin-top: 0; }
.markdown-body :deep(p:last-child) { margin-bottom: 0; }
.markdown-body :deep(code) {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
  padding: 1px 4px;
  font-size: 0.9em;
}

.cursor-blink {
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  50% { opacity: 0; }
}

/* ── 入力欄（画像と完全分離・solid背景） ── */
.vn-input-wrap {
  flex-shrink: 0;
  padding: 10px 12px;
  padding-bottom: calc(10px + env(safe-area-inset-bottom));
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
}

.vn-input-container {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.vn-textarea {
  flex: 1;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  padding: 10px 14px;
  font-family: inherit;
  font-size: max(16px, 14px); /* iOSズーム防止 */
  resize: none;
  outline: none;
  line-height: 1.5;
  max-height: 120px;
}

.vn-textarea:focus {
  border-color: var(--accent);
}

.vn-textarea:disabled {
  opacity: 0.6;
}

.send-btn {
  width: 44px;
  height: 44px;
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
  /* タップしやすくする */
  touch-action: manipulation;
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

/* スマホ：メッセージ欄を小さく抑えて顔が見えるように */
@media (max-width: 480px) {
  .dialogue-box {
    max-height: 24vh;
    padding: 10px 12px;
  }
  .dialogue-text {
    font-size: 14px;
    line-height: 1.5;
  }
  .dialogue-name {
    font-size: 11px;
    margin-bottom: 4px;
  }
}
</style>
