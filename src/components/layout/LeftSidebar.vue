<script setup lang="ts">
import { ref } from 'vue'
import { useChatStore } from '../../stores/chatStore'
import { usePersonaStore } from '../../stores/personaStore'

const chatStore = useChatStore()
const personaStore = usePersonaStore()

const editingId = ref<string | null>(null)
const editingName = ref('')

function startRename(id: string, currentName: string) {
  editingId.value = id
  editingName.value = currentName
}

function finishRename() {
  if (editingId.value && editingName.value.trim()) {
    chatStore.renameSession(editingId.value, editingName.value.trim())
  }
  editingId.value = null
}

function handleNewChat() {
  chatStore.createNewSession(personaStore.activePersonaId)
}

function handleSelectSession(id: string) {
  chatStore.setActiveSession(id)
  const personaId = chatStore.findSession(id)?.personaId
  if (personaId && personaStore.getPersonaById(personaId)) {
    personaStore.setActivePersona(personaId)
  }
}

function handleClearAll() {
  if (confirm('すべてのチャット履歴を削除します。元に戻せません。よろしいですか？')) {
    chatStore.clearAllSessions()
  }
}
</script>

<template>
  <div class="sidebar-content">
    <div class="sidebar-header">
      <span class="sidebar-title">履歴</span>
      <button class="icon-btn" @click="handleNewChat" title="新しいチャット">＋</button>
    </div>
    <div class="session-list">
      <div
        v-for="session in chatStore.sessions"
        :key="session.id"
        class="session-item"
        :class="{ active: session.id === chatStore.activeSessionId }"
        @click="handleSelectSession(session.id)"
        @dblclick="startRename(session.id, session.name)"
      >
        <template v-if="editingId === session.id">
          <input
            v-model="editingName"
            class="rename-input"
            @blur="finishRename"
            @keydown.enter="finishRename"
            @keydown.escape="editingId = null"
            @click.stop
            ref="renameInput"
            autofocus
          />
        </template>
        <template v-else>
          <span class="session-name">{{ session.name }}</span>
          <button
            class="delete-btn"
            @click.stop="chatStore.deleteSession(session.id)"
            title="削除"
          >
            ×
          </button>
        </template>
      </div>
    </div>
    <div v-if="chatStore.sessions.length > 0" class="sidebar-footer">
      <button class="clear-all-btn" @click="handleClearAll">履歴を全削除</button>
    </div>
  </div>
</template>

<style scoped>
.sidebar-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.sidebar-title {
  font-weight: 600;
  font-size: 14px;
}

.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 2px;
  gap: 8px;
}

.session-item:hover {
  background: var(--bg-tertiary);
}

.session-item.active {
  background: var(--bg-tertiary);
  border-left: 3px solid var(--accent);
}

.session-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.delete-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.session-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  color: var(--danger);
}

.rename-input {
  flex: 1;
  background: var(--bg-primary);
  border: 1px solid var(--accent);
  border-radius: 4px;
  color: var(--text-primary);
  padding: 4px 8px;
  font-size: 13px;
  outline: none;
}

.icon-btn {
  background: none;
  border: none;
  color: var(--text-primary);
  cursor: pointer;
  font-size: 18px;
  padding: 4px 8px;
  border-radius: 4px;
}

.icon-btn:hover {
  background: var(--bg-tertiary);
}

.sidebar-footer {
  flex-shrink: 0;
  padding: 8px;
  border-top: 1px solid var(--border);
}

.clear-all-btn {
  width: 100%;
  padding: 8px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.clear-all-btn:hover {
  border-color: var(--danger);
  color: var(--danger);
}
</style>
