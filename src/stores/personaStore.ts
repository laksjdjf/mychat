import { defineStore } from 'pinia'
import type { Persona } from '../types'
import { generateId } from '../utils/id'
import { personasApi } from '../services/dataApi'
import { useCollection } from '../composables/useCollection'

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
  const col = useCollection<Persona>({
    api: personasApi,
    activeStorageKey: 'mychat_activePersonaId',
    createDefault: createDefaultPersona,
  })

  function createPersona(data: Omit<Persona, 'id'>): Persona {
    return col.create({ id: generateId(), ...data })
  }

  return {
    personas: col.items,
    activePersonaId: col.activeId,
    activePersona: col.activeItem,
    getPersonaById: col.getById,
    init: col.init,
    setActivePersona: col.setActive,
    createPersona,
    updatePersona: col.update,
    deletePersona: col.remove,
    importPersonas: col.importAll,
  }
})
