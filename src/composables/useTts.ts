import { ref, readonly } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { usePersonaStore } from '../stores/personaStore'
import { fetchTtsAudio } from '../services/ttsApi'

// 2つ以上の改行で分割（（）の中身は改行1つに置換してから処理）
function splitLines(text: string): string[] {
  return text
    .replace(/\([^)]*\)/g, '\n')
    .replace(/（[^）]*）/g, '\n')
    .split(/\n{2,}/)
    .map((s) => s.replace(/\n/g, ' ').trim())
    .filter((s) => s.length > 0)
}

// ── モジュールレベルの共有状態 ──
const isPlaying = ref(false)
const progress = ref(0)          // 現在行の再生進捗 0–1
const currentLine = ref(0)       // 現在再生中の行インデックス（1始まり）
const totalLines = ref(0)
const currentText = ref('')      // 現在読み上げ中のテキスト
const currentMessageId = ref<string | null>(null)

// メッセージIDごとのデコード済みAudioBufferキャッシュ
const audioCache = new Map<string, AudioBuffer[]>()

let audioCtx: AudioContext | null = null
let currentSource: AudioBufferSourceNode | null = null
let stopRequested = false
let rafId: number | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

function startProgress(duration: number) {
  const ctx = audioCtx!
  const startAt = ctx.currentTime
  progress.value = 0

  function tick() {
    if (!audioCtx || stopRequested) return
    progress.value = Math.min((audioCtx.currentTime - startAt) / duration, 1)
    if (progress.value < 1) {
      rafId = requestAnimationFrame(tick)
    }
  }
  rafId = requestAnimationFrame(tick)
}

function stopProgress() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  progress.value = 0
}

async function decodeBuffer(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = getAudioContext()
  return ctx.decodeAudioData(arrayBuffer)
}

function playAudioBuffer(audioBuffer: AudioBuffer): Promise<void> {
  const ctx = getAudioContext()
  return new Promise((resolve) => {
    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)
    source.onended = () => {
      currentSource = null
      stopProgress()
      resolve()
    }
    currentSource = source
    source.start()
    startProgress(audioBuffer.duration)
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function speakLines(lines: string[], refWav?: string, messageId?: string): Promise<void> {
  isPlaying.value = true
  totalLines.value = lines.length
  currentMessageId.value = messageId ?? null
  stopRequested = false

  const cached = messageId ? audioCache.get(messageId) : undefined

  try {
    // 全行のフェッチ+デコードを並列で開始（キャッシュあれば即 resolve）
    const promises: Promise<AudioBuffer>[] = cached
      ? cached.map((buf) => Promise.resolve(buf))
      : lines.map((line) => fetchTtsAudio(line, refWav).then(decodeBuffer))

    const audioBuffers: AudioBuffer[] = []

    // 先頭行から「その行が準備できた瞬間」に再生（後続は並列取得中）
    for (let i = 0; i < promises.length; i++) {
      if (stopRequested) break
      currentLine.value = i + 1
      currentText.value = lines[i]
      const buf = await promises[i]
      audioBuffers.push(buf)
      if (stopRequested) break
      await playAudioBuffer(buf)
      if (i < promises.length - 1 && !stopRequested) await sleep(1000)
    }

    if (messageId && audioBuffers.length === lines.length) {
      audioCache.set(messageId, audioBuffers)
    }
  } catch (e) {
    console.error('[TTS]', e)
  } finally {
    isPlaying.value = false
    currentLine.value = 0
    totalLines.value = 0
    currentText.value = ''
    currentMessageId.value = null
    progress.value = 0
  }
}

// ── composable ──
export function useTts() {
  const settingsStore = useSettingsStore()
  const personaStore = usePersonaStore()

  function speak(text: string, messageId?: string): void {
    if (!settingsStore.ttsEnabled) return
    const lines = splitLines(text)
    if (lines.length === 0) return
    const refWav = personaStore.activePersona?.refWav || undefined
    speakLines(lines, refWav, messageId)
  }

  function respeak(text: string, messageId?: string): void {
    if (!settingsStore.ttsEnabled) return
    if (messageId) audioCache.delete(messageId)
    speak(text, messageId)
  }

  function stop(): void {
    stopRequested = true
    stopProgress()
    if (currentSource) {
      try { currentSource.stop() } catch {}
      currentSource = null
    }
    isPlaying.value = false
    currentLine.value = 0
    totalLines.value = 0
    currentText.value = ''
    currentMessageId.value = null
    progress.value = 0
  }

  return {
    isPlaying: readonly(isPlaying),
    currentMessageId: readonly(currentMessageId),
    speak,
    respeak,
    stop,
  }
}
