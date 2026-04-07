<script setup lang="ts">
import { usePersonaStore } from '../../stores/personaStore'

const personaStore = usePersonaStore()

function handleCreate() {
  const persona = personaStore.createPersona({
    name: '新しいキャラ',
    personality: '',
    scenario: '',
    avatarUrl: '',
    customFields: {},
  })
  personaStore.setActivePersona(persona.id)
}
</script>

<template>
  <div class="persona-selector">
    <label class="field-label">キャラクター選択</label>
    <div class="selector-row">
      <select
        class="persona-select"
        :value="personaStore.activePersonaId"
        @change="personaStore.setActivePersona(($event.target as HTMLSelectElement).value)"
      >
        <option
          v-for="p in personaStore.personas"
          :key="p.id"
          :value="p.id"
        >
          {{ p.name }}
        </option>
      </select>
      <button class="icon-btn" @click="handleCreate" title="新規作成">＋</button>
    </div>
  </div>
</template>

<style scoped>
.persona-selector {
  margin-bottom: 16px;
}

.field-label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.selector-row {
  display: flex;
  gap: 8px;
}

.persona-select {
  flex: 1;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  padding: 6px 10px;
  font-size: 13px;
  outline: none;
}

.persona-select:focus {
  border-color: var(--accent);
}

.icon-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 16px;
  padding: 4px 10px;
  border-radius: 6px;
}

.icon-btn:hover {
  background: var(--bg-tertiary);
}
</style>
