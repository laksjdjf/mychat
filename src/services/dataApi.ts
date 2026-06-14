import type { Persona, SystemPromptTemplate } from '../types'

const BASE = '/store'

interface Identifiable {
  id: string
}

export interface ResourceApi<T> {
  fetchAll: () => Promise<T[]>
  save: (item: T) => Promise<void>
  remove: (id: string) => Promise<void>
}

// /store/<resource> 配下の JSON を CRUD する共通クライアント
function createResourceApi<T extends Identifiable>(resource: string): ResourceApi<T> {
  return {
    async fetchAll() {
      const r = await fetch(`${BASE}/${resource}`)
      if (!r.ok) throw new Error(`fetch ${resource}: ${r.status}`)
      return r.json()
    },
    async save(item: T) {
      await fetch(`${BASE}/${resource}/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      })
    },
    async remove(id: string) {
      await fetch(`${BASE}/${resource}/${id}`, { method: 'DELETE' })
    },
  }
}

export const personasApi = createResourceApi<Persona>('personas')
export const templatesApi = createResourceApi<SystemPromptTemplate>('templates')
