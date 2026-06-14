import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ChatSession, GenerationParams, Persona, SystemPromptTemplate } from '../types'
import { usePersonaStore } from './personaStore'
import { generateId } from '../utils/id'
import { templatesApi } from '../services/dataApi'
import { useCollection } from '../composables/useCollection'

const SETTINGS_KEY = 'mychat_settings'

export const DEFAULT_GEN_PARAMS: GenerationParams = {
  temperature: 0.8,
  topP: 1,
  maxTokens: null,
  seed: null,
}

function createDefaultTemplate(): SystemPromptTemplate {
  return {
    id: generateId(),
    name: 'デフォルト',
    template: 'あなたは{{name}}です。\n{{personality}}\n\n{{scenario}}',
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function interpolateTemplate(
  template: string,
  vars: Record<string, string>
): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${escapeRegExp(key)}\\}\\}`, 'g'), value)
  }
  return result
}

export const useSettingsStore = defineStore('settings', () => {
  const col = useCollection<SystemPromptTemplate>({
    api: templatesApi,
    activeStorageKey: 'mychat_activeTemplateId',
    createDefault: createDefaultTemplate,
  })
  const activeTemplate = col.activeItem

  const _saved = (() => {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') } catch { return {} }
  })()

  const apiEndpoint = ref<string>(_saved.apiEndpoint ?? '/api')
  const ttsEnabled = ref<boolean>(_saved.ttsEnabled ?? false)
  const generationParams = ref<GenerationParams>({
    ...DEFAULT_GEN_PARAMS,
    ..._saved.generationParams,
  })

  function _saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      apiEndpoint: apiEndpoint.value,
      ttsEnabled: ttsEnabled.value,
      generationParams: generationParams.value,
    }))
  }

  function buildPersonaVars(persona: Persona): Record<string, string> {
    return {
      name: persona.name,
      personality: persona.personality,
      scenario: persona.scenario,
      ...persona.customFields,
    }
  }

  function resolveSystemPrompt(personaId: string | null | undefined): string {
    const personaStore = usePersonaStore()
    const tpl = activeTemplate.value
    const persona = personaStore.getPersonaById(personaId) ?? personaStore.activePersona
    if (!tpl) return ''
    if (!persona) return tpl.template

    return interpolateTemplate(tpl.template, buildPersonaVars(persona))
  }

  function resolveSessionSystemPrompt(session: ChatSession | null | undefined): string {
    return resolveSystemPrompt(session?.personaId)
  }

  const resolvedSystemPrompt = computed(() => {
    const personaStore = usePersonaStore()
    return resolveSystemPrompt(personaStore.activePersonaId)
  })

  function createTemplate(data: Omit<SystemPromptTemplate, 'id'>): SystemPromptTemplate {
    return col.create({ id: generateId(), ...data })
  }

  function setApiEndpoint(url: string) {
    apiEndpoint.value = url
    _saveSettings()
  }

  function setTtsEnabled(val: boolean) {
    ttsEnabled.value = val
    _saveSettings()
  }

  function setGenerationParams(patch: Partial<GenerationParams>) {
    generationParams.value = { ...generationParams.value, ...patch }
    _saveSettings()
  }

  function resetGenerationParams() {
    generationParams.value = { ...DEFAULT_GEN_PARAMS }
    _saveSettings()
  }

  return {
    templates: col.items,
    activeTemplateId: col.activeId,
    activeTemplate,
    resolvedSystemPrompt,
    resolveSystemPrompt,
    resolveSessionSystemPrompt,
    apiEndpoint,
    ttsEnabled,
    generationParams,
    init: col.init,
    setActiveTemplate: col.setActive,
    createTemplate,
    updateTemplate: col.update,
    deleteTemplate: col.remove,
    importTemplates: col.importAll,
    setApiEndpoint,
    setTtsEnabled,
    setGenerationParams,
    resetGenerationParams,
  }
})
