import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Persona } from '../types'
import { generateId } from '../utils/id'
import { fetchPersonas, savePersona, deletePersonaFile } from '../services/dataApi'

const ACTIVE_KEY = 'mychat_activePersonaId'

function createDefaultPersona(): Persona {
  return {
    id: generateId(),
    name: 'アシスタント',
    personality: '親切で知識豊富なアシスタント',
    scenario: '',
    avatarUrl: '',
    customFields: {},
  }
}

export const usePersonaStore = defineStore('persona', () => {
  const personas = ref<Persona[]>([])
  const activePersonaId = ref<string | null>(localStorage.getItem(ACTIVE_KEY))

  const activePersona = computed(() =>
    personas.value.find((p) => p.id === activePersonaId.value) ?? null
  )

  // アクティブIDをlocalStorageに保存（デバイスごとの設定）
  function setActivePersona(id: string) {
    activePersonaId.value = id
    localStorage.setItem(ACTIVE_KEY, id)
  }

  // サーバーからデータ読み込み（起動時に呼ぶ）
  async function init() {
    let loaded = await fetchPersonas()

    if (loaded.length === 0) {
      const def = createDefaultPersona()
      await savePersona(def)
      loaded = [def]
    }

    personas.value = loaded

    // 保存済みのアクティブIDが存在しない場合は先頭にフォールバック
    if (!loaded.find((p) => p.id === activePersonaId.value)) {
      setActivePersona(loaded[0].id)
    }
  }

  // ── 更新用デバウンスタイマー ──
  const updateTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function createPersona(data: Omit<Persona, 'id'>): Persona {
    const persona: Persona = { id: generateId(), ...data }
    personas.value.push(persona)
    savePersona(persona)
    return persona
  }

  function updatePersona(id: string, data: Partial<Omit<Persona, 'id'>>) {
    const idx = personas.value.findIndex((p) => p.id === id)
    if (idx === -1) return
    personas.value[idx] = { ...personas.value[idx], ...data }
    const updated = personas.value[idx]

    // キーストロークごとに書かないようにデバウンス
    if (updateTimers.has(id)) clearTimeout(updateTimers.get(id)!)
    updateTimers.set(id, setTimeout(() => {
      savePersona(updated)
      updateTimers.delete(id)
    }, 600))
  }

  function deletePersona(id: string) {
    personas.value = personas.value.filter((p) => p.id !== id)
    deletePersonaFile(id)
    if (activePersonaId.value === id) {
      const next = personas.value[0]?.id ?? null
      if (next) setActivePersona(next)
    }
  }

  function importPersonas(imported: Persona[]) {
    personas.value = imported
    imported.forEach((p) => savePersona(p))
    if (!imported.find((p) => p.id === activePersonaId.value)) {
      if (imported[0]) setActivePersona(imported[0].id)
    }
  }

  return {
    personas,
    activePersonaId,
    activePersona,
    init,
    setActivePersona,
    createPersona,
    updatePersona,
    deletePersona,
    importPersonas,
  }
})
