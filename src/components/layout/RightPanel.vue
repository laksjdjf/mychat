<script setup lang="ts">
import { ref, computed } from 'vue'
import type { GenerationParams } from '../../types'
import { useSettingsStore } from '../../stores/settingsStore'
import { usePersonaStore } from '../../stores/personaStore'
import { useChatStore } from '../../stores/chatStore'
import PersonaEditor from '../persona/PersonaEditor.vue'
import PersonaSelector from '../persona/PersonaSelector.vue'
import { downscaleImage } from '../../utils/downscaleImage'

const settingsStore = useSettingsStore()
const personaStore = usePersonaStore()
const chatStore = useChatStore()

const gen = computed(() => settingsStore.generationParams)

function setParam(patch: Partial<GenerationParams>) {
  settingsStore.setGenerationParams(patch)
}

// max_tokens / seed は空欄で null（サーバー既定）にする
function setNullableParam(key: 'maxTokens' | 'seed', value: string) {
  const trimmed = value.trim()
  settingsStore.setGenerationParams({ [key]: trimmed === '' ? null : Number(trimmed) })
}

const activeTab = ref<'persona' | 'system' | 'settings'>('persona')

const templateText = computed({
  get: () => settingsStore.activeTemplate?.template ?? '',
  set: (val: string) => {
    if (settingsStore.activeTemplate) {
      settingsStore.updateTemplate(settingsStore.activeTemplate.id, {
        template: val,
      })
    }
  },
})

const placeholderText = 'システムプロンプトを入力...\n{{name}} {{personality}} {{scenario}} が使えます'

const availablePlaceholders = computed(() => {
  const persona =
    personaStore.getPersonaById(chatStore.activeSession?.personaId) ?? personaStore.activePersona
  if (!persona) return []
  const keys = ['name', 'personality', 'scenario']
  if (persona.customFields) {
    keys.push(...Object.keys(persona.customFields))
  }
  return keys
})

const previewSystemPrompt = computed(() =>
  settingsStore.resolveSystemPrompt(chatStore.activeSession?.personaId ?? personaStore.activePersonaId)
)

function handleCreateTemplate() {
  const tpl = settingsStore.createTemplate({ name: '新しいテンプレート', template: '' })
  settingsStore.setActiveTemplate(tpl.id)
}

function handleDeleteTemplate() {
  if (!settingsStore.activeTemplate || settingsStore.templates.length <= 1) return
  settingsStore.deleteTemplate(settingsStore.activeTemplate.id)
}

// Export
function exportData() {
  const data = {
    personas: personaStore.personas,
    templates: settingsStore.templates,
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `mychat-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// 既存アバターの一括最適化（巨大base64を縮小して読み込み・描画を軽くする）
const optimizing = ref(false)
const optimizeStatus = ref('')

async function optimizeAvatars() {
  if (optimizing.value) return
  optimizing.value = true
  const targets = personaStore.personas.filter((p) => p.avatarUrl?.startsWith('data:'))
  let done = 0
  let savedBytes = 0
  for (const p of targets) {
    try {
      const before = p.avatarUrl.length
      const smaller = await downscaleImage(p.avatarUrl)
      if (smaller.length < before) {
        personaStore.updatePersona(p.id, { avatarUrl: smaller })
        savedBytes += before - smaller.length
      }
    } catch { /* この1件はスキップ */ }
    done++
    optimizeStatus.value = `最適化中… ${done}/${targets.length}`
  }
  const savedMb = (savedBytes / 1024 / 1024).toFixed(1)
  optimizeStatus.value = `完了：${targets.length}件、約${savedMb}MB 削減`
  optimizing.value = false
}

// Import
const importInput = ref<HTMLInputElement | null>(null)

function handleImportFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result as string)
      if (Array.isArray(data.personas) && data.personas.length > 0) {
        personaStore.importPersonas(data.personas)
      }
      if (Array.isArray(data.templates) && data.templates.length > 0) {
        settingsStore.importTemplates(data.templates)
      }
    } catch {
      alert('インポートに失敗しました。JSONファイルを確認してください。')
    }
    if (importInput.value) importInput.value.value = ''
  }
  reader.readAsText(file)
}
</script>

<template>
  <div class="right-panel-content">
    <div class="panel-tabs">
      <button
        :class="{ active: activeTab === 'persona' }"
        @click="activeTab = 'persona'"
      >
        ペルソナ
      </button>
      <button
        :class="{ active: activeTab === 'system' }"
        @click="activeTab = 'system'"
      >
        システム
      </button>
      <button
        :class="{ active: activeTab === 'settings' }"
        @click="activeTab = 'settings'"
      >
        設定
      </button>
    </div>

    <!-- Persona Tab -->
    <div v-if="activeTab === 'persona'" class="tab-content">
      <PersonaSelector />
      <PersonaEditor />
    </div>

    <!-- System Prompt Tab -->
    <div v-if="activeTab === 'system'" class="tab-content">
      <label class="field-label">テンプレート選択</label>
      <div class="selector-row">
        <select
          class="template-select"
          :value="settingsStore.activeTemplateId"
          @change="settingsStore.setActiveTemplate(($event.target as HTMLSelectElement).value)"
        >
          <option
            v-for="t in settingsStore.templates"
            :key="t.id"
            :value="t.id"
          >
            {{ t.name }}
          </option>
        </select>
        <button class="icon-btn" @click="handleCreateTemplate" title="新規作成">＋</button>
        <button
          class="icon-btn danger"
          @click="handleDeleteTemplate"
          :disabled="settingsStore.templates.length <= 1"
          title="削除"
        >×</button>
      </div>

      <label class="field-label">テンプレート名</label>
      <input
        class="text-input"
        :value="settingsStore.activeTemplate?.name ?? ''"
        @input="settingsStore.activeTemplate && settingsStore.updateTemplate(settingsStore.activeTemplate.id, { name: ($event.target as HTMLInputElement).value })"
      />

      <label class="field-label">内容</label>
      <textarea
        v-model="templateText"
        class="template-textarea"
        :placeholder="placeholderText"
        rows="8"
      />

      <div class="placeholders">
        <span class="field-label">使用可能な変数:</span>
        <div class="placeholder-tags">
          <span
            v-for="key in availablePlaceholders"
            :key="key"
            class="placeholder-tag"
            v-text="'{{' + key + '}}'"
          />
        </div>
      </div>

      <label class="field-label">プレビュー</label>
      <div class="preview-box">
        {{ previewSystemPrompt || '(空)' }}
      </div>
    </div>

    <!-- Settings Tab -->
    <div v-if="activeTab === 'settings'" class="tab-content">
      <label class="field-label">APIエンドポイント</label>
      <input
        :value="settingsStore.apiEndpoint"
        @input="settingsStore.setApiEndpoint(($event.target as HTMLInputElement).value)"
        class="text-input"
        placeholder="http://localhost:8080"
      />

      <label class="field-label" style="margin-top: 24px;">生成パラメータ</label>

      <div class="param-field">
        <div class="param-head">
          <span class="param-name">Temperature</span>
          <input
            class="param-num"
            type="number"
            min="0"
            max="2"
            step="0.05"
            :value="gen.temperature"
            @input="setParam({ temperature: Number(($event.target as HTMLInputElement).value) })"
          />
        </div>
        <input
          class="param-range"
          type="range"
          min="0"
          max="2"
          step="0.05"
          :value="gen.temperature"
          @input="setParam({ temperature: Number(($event.target as HTMLInputElement).value) })"
        />
      </div>

      <div class="param-field">
        <div class="param-head">
          <span class="param-name">Top P</span>
          <input
            class="param-num"
            type="number"
            min="0"
            max="1"
            step="0.05"
            :value="gen.topP"
            @input="setParam({ topP: Number(($event.target as HTMLInputElement).value) })"
          />
        </div>
        <input
          class="param-range"
          type="range"
          min="0"
          max="1"
          step="0.05"
          :value="gen.topP"
          @input="setParam({ topP: Number(($event.target as HTMLInputElement).value) })"
        />
      </div>

      <label class="field-label">最大トークン数（空欄＝無制限）</label>
      <input
        class="text-input"
        type="number"
        min="1"
        :value="gen.maxTokens ?? ''"
        placeholder="無制限"
        @input="setNullableParam('maxTokens', ($event.target as HTMLInputElement).value)"
      />

      <label class="field-label">シード（空欄＝ランダム）</label>
      <input
        class="text-input"
        type="number"
        :value="gen.seed ?? ''"
        placeholder="ランダム"
        @input="setNullableParam('seed', ($event.target as HTMLInputElement).value)"
      />

      <button class="action-btn" style="margin-top: 10px;" @click="settingsStore.resetGenerationParams()">
        デフォルトに戻す
      </button>

      <label class="field-label" style="margin-top: 24px;">TTS (音声読み上げ)</label>
      <div class="tts-row">
        <span class="tts-label">有効</span>
        <button
          class="toggle-btn"
          :class="{ active: settingsStore.ttsEnabled }"
          @click="settingsStore.setTtsEnabled(!settingsStore.ttsEnabled)"
        >
          {{ settingsStore.ttsEnabled ? 'ON' : 'OFF' }}
        </button>
      </div>
      <p class="data-hint">Irodori-TTS サーバー（ポート8000）にプロキシ経由で接続します。参照音声はペルソナ設定で指定します。</p>

      <label class="field-label" style="margin-top: 24px;">データ管理</label>
      <div class="data-actions">
        <button class="action-btn" @click="exportData">エクスポート (.json)</button>
        <label class="action-btn import-label">
          インポート (.json)
          <input
            ref="importInput"
            type="file"
            accept=".json,application/json"
            class="file-input"
            @change="handleImportFile"
          />
        </label>
      </div>
      <p class="data-hint">ペルソナとテンプレートを1つのJSONファイルで保存・読み込みできます。</p>

      <label class="field-label" style="margin-top: 24px;">アバター最適化</label>
      <button class="action-btn" @click="optimizeAvatars" :disabled="optimizing">
        {{ optimizing ? '最適化中…' : 'アバターを軽量化' }}
      </button>
      <p v-if="optimizeStatus" class="data-hint">{{ optimizeStatus }}</p>
      <p class="data-hint">巨大な画像アバターを縮小して、読み込みと表示を軽くします（スマホで重い時に）。</p>
    </div>
  </div>
</template>

<style scoped>
.right-panel-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.panel-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.panel-tabs button {
  flex: 1;
  padding: 10px 8px;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  border-bottom: 2px solid transparent;
}

.panel-tabs button.active {
  color: var(--text-primary);
  border-bottom-color: var(--accent);
}

.panel-tabs button:hover {
  background: var(--bg-tertiary);
}

.tab-content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.field-label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
  margin-top: 12px;
}

.field-label:first-child {
  margin-top: 0;
}

.selector-row {
  display: flex;
  gap: 6px;
}

.template-select {
  flex: 1;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  padding: 6px 10px;
  font-size: 13px;
  outline: none;
}

.template-select:focus {
  border-color: var(--accent);
}

.icon-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 14px;
  padding: 4px 10px;
  border-radius: 6px;
}

.icon-btn:hover {
  background: var(--bg-tertiary);
}

.icon-btn.danger:hover {
  border-color: var(--danger);
  color: var(--danger);
}

.icon-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.text-input {
  width: 100%;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  padding: 6px 10px;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
}

.text-input:focus {
  border-color: var(--accent);
}

.template-textarea {
  width: 100%;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  padding: 10px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
}

.template-textarea:focus {
  border-color: var(--accent);
}

.placeholders {
  margin-top: 8px;
}

.placeholder-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.placeholder-tag {
  background: var(--bg-tertiary);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-family: monospace;
  color: var(--accent);
}

.preview-box {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 150px;
  overflow-y: auto;
  color: var(--text-secondary);
}

.param-field {
  margin-top: 12px;
}

.param-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.param-name {
  font-size: 13px;
  color: var(--text-primary);
}

.param-num {
  width: 64px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  padding: 4px 8px;
  font-size: 13px;
  outline: none;
  text-align: right;
}

.param-num:focus {
  border-color: var(--accent);
}

.param-range {
  width: 100%;
  accent-color: var(--accent);
  cursor: pointer;
}

.data-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.action-btn {
  display: block;
  width: 100%;
  padding: 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  text-align: center;
}

.action-btn:hover {
  background: var(--border);
}

.import-label {
  cursor: pointer;
}

.file-input {
  display: none;
}

.data-hint {
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.tts-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.tts-label {
  font-size: 13px;
  color: var(--text-primary);
}

.toggle-btn {
  padding: 4px 14px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.toggle-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
</style>
