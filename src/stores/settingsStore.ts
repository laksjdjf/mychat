import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { SystemPromptTemplate } from '../types'
import { usePersonaStore } from './personaStore'
import { generateId } from '../utils/id'
import { fetchTemplates, saveTemplate, deleteTemplateFile } from '../services/dataApi'

const ACTIVE_TEMPLATE_KEY = 'mychat_activeTemplateId'
const SETTINGS_KEY = 'mychat_settings'

function createDefaultTemplate(): SystemPromptTemplate {
  return {
    id: generateId(),
    name: 'デフォルト',
    template: 'あなたは{{name}}です。\n{{personality}}\n\n{{scenario}}',
  }
}

export function interpolateTemplate(
  template: string,
  vars: Record<string, string>
): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }
  return result
}

export const useSettingsStore = defineStore('settings', () => {
  const templates = ref<SystemPromptTemplate[]>([])
  const activeTemplateId = ref<string | null>(localStorage.getItem(ACTIVE_TEMPLATE_KEY))

  const _saved = (() => {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') } catch { return {} }
  })()

  const apiEndpoint = ref<string>(_saved.apiEndpoint ?? '/api')
  const ttsEnabled = ref<boolean>(_saved.ttsEnabled ?? false)

  function _saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      apiEndpoint: apiEndpoint.value,
      ttsEnabled: ttsEnabled.value,
    }))
  }

  const activeTemplate = computed(() =>
    templates.value.find((t) => t.id === activeTemplateId.value) ?? null
  )

  const resolvedSystemPrompt = computed(() => {
    const personaStore = usePersonaStore()
    const tpl = activeTemplate.value
    const persona = personaStore.activePersona
    if (!tpl) return ''
    if (!persona) return tpl.template

    const vars: Record<string, string> = {
      name: persona.name,
      personality: persona.personality,
      scenario: persona.scenario,
      ...persona.customFields,
    }
    return interpolateTemplate(tpl.template, vars)
  })

  // アクティブIDをlocalStorageに保存（デバイスごとの設定）
  function setActiveTemplate(id: string) {
    activeTemplateId.value = id
    localStorage.setItem(ACTIVE_TEMPLATE_KEY, id)
  }

  // サーバーからデータ読み込み（起動時に呼ぶ）
  async function init() {
    let loaded = await fetchTemplates()

    if (loaded.length === 0) {
      const def = createDefaultTemplate()
      await saveTemplate(def)
      loaded = [def]
    }

    templates.value = loaded

    if (!loaded.find((t) => t.id === activeTemplateId.value)) {
      setActiveTemplate(loaded[0].id)
    }
  }

  // ── 更新用デバウンスタイマー ──
  const updateTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function createTemplate(data: Omit<SystemPromptTemplate, 'id'>): SystemPromptTemplate {
    const tpl: SystemPromptTemplate = { id: generateId(), ...data }
    templates.value.push(tpl)
    saveTemplate(tpl)
    return tpl
  }

  function updateTemplate(id: string, data: Partial<Omit<SystemPromptTemplate, 'id'>>) {
    const idx = templates.value.findIndex((t) => t.id === id)
    if (idx === -1) return
    templates.value[idx] = { ...templates.value[idx], ...data }
    const updated = templates.value[idx]

    if (updateTimers.has(id)) clearTimeout(updateTimers.get(id)!)
    updateTimers.set(id, setTimeout(() => {
      saveTemplate(updated)
      updateTimers.delete(id)
    }, 600))
  }

  function deleteTemplate(id: string) {
    templates.value = templates.value.filter((t) => t.id !== id)
    deleteTemplateFile(id)
    if (activeTemplateId.value === id) {
      const next = templates.value[0]?.id ?? null
      if (next) setActiveTemplate(next)
    }
  }

  function importTemplates(imported: SystemPromptTemplate[]) {
    templates.value = imported
    imported.forEach((t) => saveTemplate(t))
    if (!imported.find((t) => t.id === activeTemplateId.value)) {
      if (imported[0]) setActiveTemplate(imported[0].id)
    }
  }

  function setApiEndpoint(url: string) {
    apiEndpoint.value = url
    _saveSettings()
  }

  function setTtsEnabled(val: boolean) {
    ttsEnabled.value = val
    _saveSettings()
  }

  return {
    templates,
    activeTemplateId,
    activeTemplate,
    resolvedSystemPrompt,
    apiEndpoint,
    ttsEnabled,
    init,
    setActiveTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    importTemplates,
    setApiEndpoint,
    setTtsEnabled,
  }
})
