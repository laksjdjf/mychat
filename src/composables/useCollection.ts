import { ref, computed, type Ref } from 'vue'
import type { ResourceApi } from '../services/dataApi'

interface Identifiable {
  id: string
}

interface CollectionOptions<T> {
  api: ResourceApi<T>
  activeStorageKey: string
  createDefault?: () => T
  saveDebounceMs?: number
}

/**
 * 「一覧 + 選択中ID + サーバー永続化」という共通パターンをまとめた composable。
 * personaStore / settingsStore(テンプレート) が共有する。
 *
 * - activeId は localStorage に保存（デバイスごとの設定）
 * - update はキーストロークごとに書かないようデバウンス
 */
export function useCollection<T extends Identifiable>(options: CollectionOptions<T>) {
  const { api, activeStorageKey, createDefault, saveDebounceMs = 600 } = options

  const items = ref<T[]>([]) as Ref<T[]>
  const activeId = ref<string | null>(localStorage.getItem(activeStorageKey))

  const activeItem = computed(() => items.value.find((i) => i.id === activeId.value) ?? null)

  function getById(id: string | null | undefined): T | null {
    if (!id) return null
    return items.value.find((i) => i.id === id) ?? null
  }

  function setActive(id: string) {
    activeId.value = id
    localStorage.setItem(activeStorageKey, id)
  }

  // サーバーからデータ読み込み（起動時に呼ぶ）
  async function init() {
    let loaded = await api.fetchAll()

    if (loaded.length === 0 && createDefault) {
      const def = createDefault()
      await api.save(def)
      loaded = [def]
    }

    items.value = loaded

    // 保存済みのアクティブIDが存在しない場合は先頭にフォールバック
    if (!loaded.find((i) => i.id === activeId.value)) {
      const first = loaded[0]
      if (first) setActive(first.id)
    }
  }

  function create(item: T): T {
    items.value.push(item)
    api.save(item)
    return item
  }

  // ── 更新用デバウンスタイマー ──
  const updateTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function update(id: string, patch: Partial<T>) {
    const idx = items.value.findIndex((i) => i.id === id)
    if (idx === -1) return
    const current = items.value[idx]
    if (!current) return
    const updated = { ...current, ...patch } as T
    items.value[idx] = updated

    if (updateTimers.has(id)) clearTimeout(updateTimers.get(id)!)
    updateTimers.set(id, setTimeout(() => {
      api.save(updated)
      updateTimers.delete(id)
    }, saveDebounceMs))
  }

  function remove(id: string) {
    items.value = items.value.filter((i) => i.id !== id)
    api.remove(id)
    if (activeId.value === id) {
      const next = items.value[0]?.id ?? null
      if (next) setActive(next)
    }
  }

  function importAll(imported: T[]) {
    items.value = imported
    imported.forEach((i) => api.save(i))
    if (!imported.find((i) => i.id === activeId.value)) {
      if (imported[0]) setActive(imported[0].id)
    }
  }

  return { items, activeId, activeItem, getById, setActive, init, create, update, remove, importAll }
}
