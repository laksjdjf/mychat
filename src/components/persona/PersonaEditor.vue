<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { usePersonaStore } from '../../stores/personaStore'
import { useChatStore } from '../../stores/chatStore'
import { IRODORI_SPEAKER_EMBEDS } from '../../services/tts/irodoriChatWorkflow'
import { fetchSpeakerEmbeds } from '../../services/tts/comfyProvider'

const personaStore = usePersonaStore()
const chatStore = useChatStore()

const persona = computed(() =>
  personaStore.getPersonaById(chatStore.activeSession?.personaId) ?? personaStore.activePersona
)

const newFieldKey = ref('')

// 声リストは ComfyUI から動的取得（取得できなければ固定リストにフォールバック）
const speakerEmbeds = ref<readonly string[]>(IRODORI_SPEAKER_EMBEDS)
onMounted(() => {
  fetchSpeakerEmbeds()
    .then((list) => { if (list.length) speakerEmbeds.value = list })
    .catch(() => { /* ComfyUI未起動など → 固定フォールバックのまま */ })
})

// ── フォーカルポイントピッカー ──
const pickerEl = ref<HTMLElement | null>(null)
const pickerImgEl = ref<HTMLImageElement | null>(null)
const imgRatio = ref(1.5) // naturalHeight / naturalWidth

const focalX = computed(() => persona.value?.avatarFocalPoint?.x ?? 50)
const focalY = computed(() => persona.value?.avatarFocalPoint?.y ?? 50)

function onImgLoad() {
  const img = pickerImgEl.value
  if (img) imgRatio.value = img.naturalHeight / img.naturalWidth
}

// 画像内クリック → フォーカルポイント更新
function onPickerClick(e: MouseEvent) {
  const el = pickerEl.value
  if (!el || !persona.value) return
  const rect = el.getBoundingClientRect()
  const x = Math.round(((e.clientX - rect.left) / rect.width) * 100)
  const y = Math.round(((e.clientY - rect.top) / rect.height) * 100)
  personaStore.updatePersona(persona.value.id, {
    avatarFocalPoint: {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    },
  })
}

// チャット用の四角トリミング枠（縦長画像の中でどこを切り出すか）
const cropSquareStyle = computed(() => {
  const el = pickerEl.value
  if (!el) return {}
  const pW = el.clientWidth
  if (imgRatio.value <= 1) {
    // 横長画像：横がはみ出す
    const pH = pW / imgRatio.value
    const sqSize = pH
    const left = (pW - sqSize) * focalX.value / 100
    return { width: sqSize + 'px', height: sqSize + 'px', top: '0px', left: left + 'px' }
  } else {
    // 縦長画像：縦がはみ出す
    const pH = pW * imgRatio.value
    const sqSize = pW
    const top = (pH - sqSize) * focalY.value / 100
    return { width: sqSize + 'px', height: sqSize + 'px', top: top + 'px', left: '0px' }
  }
})

// ── その他の編集関数 ──
function updateField(field: string, value: string) {
  if (!persona.value) return
  personaStore.updatePersona(persona.value.id, { [field]: value })
}

function updateCustomField(key: string, value: string) {
  if (!persona.value) return
  personaStore.updatePersona(persona.value.id, { customFields: { ...persona.value.customFields, [key]: value } })
}

function addCustomField() {
  const key = newFieldKey.value.trim()
  if (!key || !persona.value) return
  if (persona.value.customFields[key] !== undefined) return
  personaStore.updatePersona(persona.value.id, { customFields: { ...persona.value.customFields, [key]: '' } })
  newFieldKey.value = ''
}

function removeCustomField(key: string) {
  if (!persona.value) return
  const customFields = { ...persona.value.customFields }
  delete customFields[key]
  personaStore.updatePersona(persona.value.id, { customFields })
}

function handleDelete() {
  if (!persona.value || personaStore.personas.length <= 1) return
  personaStore.deletePersona(persona.value.id)
}

function handleAvatarFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file || !persona.value) return
  const reader = new FileReader()
  reader.onload = () => {
    personaStore.updatePersona(persona.value!.id, { avatarUrl: reader.result as string })
  }
  reader.readAsDataURL(file)
}
</script>

<template>
  <div v-if="persona" class="persona-editor">

    <!-- 縦長画像プレビュー＋フォーカルポイントピッカー -->
    <div class="avatar-section">
      <div
        ref="pickerEl"
        class="portrait-picker"
        :class="{ 'has-image': !!persona.avatarUrl }"
        @click="onPickerClick"
      >
        <template v-if="persona.avatarUrl">
          <img
            ref="pickerImgEl"
            :src="persona.avatarUrl"
            class="portrait-img"
            @load="onImgLoad"
          />
          <!-- チャット用トリミング枠 -->
          <div class="crop-square" :style="cropSquareStyle" />
          <!-- フォーカルポイントの十字 -->
          <div
            class="focal-dot"
            :style="{ left: focalX + '%', top: focalY + '%' }"
          />
          <div class="picker-hint">クリックでトリミング位置を変更</div>
        </template>
        <div v-else class="portrait-placeholder">
          {{ persona.name[0] || '?' }}
        </div>
      </div>

      <!-- チャットでの見え方プレビュー -->
      <div class="chat-preview-wrap">
        <div class="chat-preview-label">チャット表示</div>
        <div class="chat-preview-box">
          <img
            v-if="persona.avatarUrl"
            :src="persona.avatarUrl"
            class="chat-preview-img"
            :style="{ objectPosition: focalX + '% ' + focalY + '%' }"
          />
          <div v-else class="chat-preview-placeholder">{{ persona.name[0] || '?' }}</div>
        </div>
        <label class="file-label">
          画像を選択
          <input type="file" accept="image/*" class="file-input" @change="handleAvatarFile" />
        </label>
      </div>
    </div>

    <!-- Name -->
    <label class="field-label">キャラ名</label>
    <input
      class="text-input"
      :value="persona.name"
      @input="updateField('name', ($event.target as HTMLInputElement).value)"
    />

    <!-- Personality -->
    <label class="field-label">性格・特徴</label>
    <textarea
      class="text-area"
      :value="persona.personality"
      @input="updateField('personality', ($event.target as HTMLTextAreaElement).value)"
      rows="3"
    />

    <!-- Scenario -->
    <label class="field-label">シナリオ・設定</label>
    <textarea
      class="text-area"
      :value="persona.scenario"
      @input="updateField('scenario', ($event.target as HTMLTextAreaElement).value)"
      rows="3"
    />

    <!-- TTS Voice (speaker embedding) -->
    <label class="field-label">声 (TTS)</label>
    <select
      class="text-input"
      :value="persona.ttsSpeakerEmbed ?? ''"
      @change="updateField('ttsSpeakerEmbed', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">（既定）</option>
      <option v-for="embed in speakerEmbeds" :key="embed" :value="embed">
        {{ embed.replace('.safetensors', '') }}
      </option>
    </select>

    <!-- Custom Fields -->
    <label class="field-label">カスタムフィールド</label>
    <div v-for="(value, key) in persona.customFields" :key="key" class="custom-field">
      <span class="custom-key">{{ key }}</span>
      <input
        class="text-input custom-value"
        :value="value"
        @input="updateCustomField(key as string, ($event.target as HTMLInputElement).value)"
      />
      <button class="remove-btn" @click="removeCustomField(key as string)">×</button>
    </div>
    <div class="add-field-row">
      <input v-model="newFieldKey" class="text-input" placeholder="フィールド名" @keydown.enter="addCustomField" />
      <button class="icon-btn" @click="addCustomField" :disabled="!newFieldKey.trim()">追加</button>
    </div>

    <!-- Delete -->
    <button v-if="personaStore.personas.length > 1" class="delete-persona-btn" @click="handleDelete">
      このペルソナを削除
    </button>
  </div>
</template>

<style scoped>
.persona-editor {
  padding-top: 4px;
}

/* ── アバターセクション ── */
.avatar-section {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  align-items: flex-start;
}

/* 縦長画像ピッカー */
.portrait-picker {
  flex: 1;
  position: relative;
  cursor: crosshair;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-tertiary);
  min-height: 80px;
}

.portrait-picker.has-image:hover .picker-hint {
  opacity: 1;
}

.portrait-img {
  width: 100%;
  height: auto;
  display: block;
  user-select: none;
  pointer-events: none;
}

/* チャット用トリミング枠 */
.crop-square {
  position: absolute;
  border: 2px dashed rgba(255, 255, 255, 0.85);
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}

/* フォーカルポイント十字 */
.focal-dot {
  position: absolute;
  width: 14px;
  height: 14px;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.focal-dot::before,
.focal-dot::after {
  content: '';
  position: absolute;
  background: #fff;
  border-radius: 2px;
}
.focal-dot::before { width: 2px; height: 14px; left: 6px; top: 0; }
.focal-dot::after  { width: 14px; height: 2px; left: 0; top: 6px; }

.picker-hint {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0,0,0,0.55);
  color: #fff;
  font-size: 10px;
  text-align: center;
  padding: 3px;
  opacity: 0;
  transition: opacity 0.2s;
}

.portrait-placeholder {
  width: 100%;
  aspect-ratio: 2 / 3;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  font-size: 32px;
  font-weight: 700;
  color: #fff;
  border-radius: 8px;
}

/* チャット表示プレビュー */
.chat-preview-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.chat-preview-label {
  font-size: 10px;
  color: var(--text-secondary);
}

.chat-preview-box {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border);
}

.chat-preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.chat-preview-placeholder {
  width: 100%;
  height: 100%;
  background: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 700;
  color: #fff;
}

.file-label {
  font-size: 11px;
  color: var(--accent);
  cursor: pointer;
  padding: 3px 8px;
  border: 1px solid var(--accent);
  border-radius: 4px;
  white-space: nowrap;
}

.file-label:hover { background: rgba(124, 92, 191, 0.1); }
.file-input { display: none; }

/* ── フォームフィールド ── */
.field-label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
  margin-top: 12px;
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
.text-input:focus { border-color: var(--accent); }

.text-area {
  width: 100%;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  padding: 6px 10px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
}
.text-area:focus { border-color: var(--accent); }

.custom-field { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.custom-key { font-size: 12px; color: var(--accent); min-width: 60px; font-family: monospace; }
.custom-value { flex: 1; }

.remove-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 16px;
  padding: 2px 6px;
}
.remove-btn:hover { color: var(--danger); }

.add-field-row { display: flex; gap: 6px; margin-top: 6px; }
.add-field-row .text-input { flex: 1; }

.icon-btn {
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 6px;
  white-space: nowrap;
}
.icon-btn:hover { background: var(--border); }
.icon-btn:disabled { opacity: 0.4; cursor: default; }

.delete-persona-btn {
  margin-top: 20px;
  width: 100%;
  padding: 8px;
  background: none;
  border: 1px solid var(--danger);
  color: var(--danger);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}
.delete-persona-btn:hover { background: rgba(224, 49, 49, 0.1); }
</style>
