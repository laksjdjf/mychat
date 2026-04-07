<script setup lang="ts">
import { ref } from 'vue'
import { useStreamingChat } from '../../composables/useStreamingChat'
import MessageList from './MessageList.vue'
import ChatInput from './ChatInput.vue'
import VNMode from './VNMode.vue'

const { isGenerating, error, sendMessage, stopGeneration, regenerateFrom } =
  useStreamingChat()

const vnMode = ref(localStorage.getItem('mychat_vnmode') === 'true')

function toggleVnMode() {
  vnMode.value = !vnMode.value
  localStorage.setItem('mychat_vnmode', String(vnMode.value))
}
</script>

<template>
  <div class="chat-area">
    <!-- モード切り替えボタン -->
    <button
      class="vn-toggle"
      :class="{ active: vnMode }"
      @click="toggleVnMode"
      :title="vnMode ? 'チャットモードに切り替え' : 'ビジュアルノベルモードに切り替え'"
    >
      {{ vnMode ? '💬' : '🎭' }}
    </button>

    <!-- VNモード -->
    <VNMode
      v-if="vnMode"
      :is-generating="isGenerating"
      @send="sendMessage"
      @stop="stopGeneration"
    />

    <!-- 通常チャットモード -->
    <template v-else>
      <MessageList
        :is-generating="isGenerating"
        @regenerate="regenerateFrom"
      />
      <div v-if="error" class="error-bar">
        {{ error }}
      </div>
      <ChatInput
        :is-generating="isGenerating"
        @send="sendMessage"
        @stop="stopGeneration"
      />
    </template>
  </div>
</template>

<style scoped>
.chat-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  position: relative;
}

.vn-toggle {
  position: absolute;
  top: 8px;
  right: 12px;
  z-index: 10;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 18px;
  padding: 4px 8px;
  line-height: 1;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.vn-toggle:hover,
.vn-toggle.active {
  opacity: 1;
}

.error-bar {
  padding: 8px 16px;
  background: rgba(224, 49, 49, 0.15);
  color: var(--danger);
  font-size: 13px;
  border-top: 1px solid var(--danger);
  flex-shrink: 0;
}
</style>
