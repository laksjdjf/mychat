<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppLayout from './components/layout/AppLayout.vue'
import { usePersonaStore } from './stores/personaStore'
import { useSettingsStore } from './stores/settingsStore'

const personaStore = usePersonaStore()
const settingsStore = useSettingsStore()

const ready = ref(false)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    await Promise.all([
      personaStore.init(),
      settingsStore.init(),
    ])
    ready.value = true
  } catch (e) {
    error.value = 'データの読み込みに失敗しました。Viteサーバーが起動しているか確認してください。'
    console.error(e)
  }
})
</script>

<template>
  <div v-if="error" class="startup-screen">
    <div class="startup-card">
      <p class="error-icon">⚠️</p>
      <p class="error-msg">{{ error }}</p>
    </div>
  </div>

  <div v-else-if="!ready" class="startup-screen">
    <div class="startup-card">
      <div class="spinner" />
      <p class="loading-text">読み込み中...</p>
    </div>
  </div>

  <AppLayout v-else />
</template>

<style scoped>
.startup-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100dvh;
  background: var(--bg-primary);
}

.startup-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.error-icon {
  font-size: 32px;
  margin: 0;
}

.error-msg {
  font-size: 13px;
  color: var(--text-secondary);
  text-align: center;
  max-width: 280px;
  line-height: 1.6;
  margin: 0;
}
</style>
