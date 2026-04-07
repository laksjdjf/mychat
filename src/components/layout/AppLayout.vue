<script setup lang="ts">
import { ref, onMounted } from 'vue'
import LeftSidebar from './LeftSidebar.vue'
import RightPanel from './RightPanel.vue'
import ChatArea from '../chat/ChatArea.vue'

const showLeftSidebar = ref(true)
const showRightPanel = ref(true)
const isMobile = ref(false)

function checkMobile() {
  isMobile.value = window.innerWidth < 768
  if (isMobile.value) {
    showLeftSidebar.value = false
    showRightPanel.value = false
  }
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
})

function toggleLeft() {
  showLeftSidebar.value = !showLeftSidebar.value
  if (isMobile.value && showLeftSidebar.value) {
    showRightPanel.value = false
  }
}

function toggleRight() {
  showRightPanel.value = !showRightPanel.value
  if (isMobile.value && showRightPanel.value) {
    showLeftSidebar.value = false
  }
}

function closeOverlays() {
  if (isMobile.value) {
    showLeftSidebar.value = false
    showRightPanel.value = false
  }
}
</script>

<template>
  <div
    class="app-layout"
    :class="{
      'sidebar-hidden': !showLeftSidebar,
      'right-hidden': !showRightPanel,
      'mobile': isMobile,
    }"
  >
    <!-- Mobile overlay backdrop -->
    <div
      v-if="isMobile && (showLeftSidebar || showRightPanel)"
      class="overlay-backdrop"
      @click="closeOverlays"
    />

    <aside class="left-sidebar" :class="{ 'overlay-open': isMobile && showLeftSidebar }">
      <LeftSidebar />
    </aside>

    <main class="chat-main">
      <div class="topbar">
        <button class="icon-btn" @click="toggleLeft" title="履歴">
          ☰
        </button>
        <span class="topbar-title">MyChat</span>
        <button class="icon-btn" @click="toggleRight" title="設定">
          ⚙
        </button>
      </div>
      <ChatArea />
    </main>

    <aside class="right-panel" :class="{ 'overlay-open': isMobile && showRightPanel }">
      <RightPanel />
    </aside>
  </div>
</template>

<style scoped>
.app-layout {
  display: grid;
  grid-template-columns: 260px 1fr 320px;
  height: 100dvh;
  overflow: hidden;
  background: var(--bg-primary);
  color: var(--text-primary);
  transition: grid-template-columns 0.2s ease;
}

.app-layout.sidebar-hidden {
  grid-template-columns: 0px 1fr 320px;
}

.app-layout.right-hidden {
  grid-template-columns: 260px 1fr 0px;
}

.app-layout.sidebar-hidden.right-hidden {
  grid-template-columns: 0px 1fr 0px;
}

/* Mobile: always single column */
.app-layout.mobile {
  grid-template-columns: 0px 1fr 0px;
}

.left-sidebar {
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  overflow: hidden;
  min-width: 0;
}

.chat-main {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.right-panel {
  background: var(--bg-secondary);
  border-left: 1px solid var(--border);
  overflow: hidden;
  min-width: 0;
}

/* Mobile overlay panels */
.overlay-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 90;
}

.mobile .left-sidebar.overlay-open {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 280px;
  z-index: 100;
  overflow-y: auto;
  box-shadow: 4px 0 12px rgba(0, 0, 0, 0.15);
}

.mobile .right-panel.overlay-open {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 300px;
  z-index: 100;
  overflow-y: auto;
  box-shadow: -4px 0 12px rgba(0, 0, 0, 0.15);
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
  flex-shrink: 0;
}

.topbar-title {
  font-weight: 600;
  font-size: 14px;
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
</style>
