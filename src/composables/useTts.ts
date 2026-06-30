import { ref, readonly } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { usePersonaStore } from '../stores/personaStore'
import { fetchTtsAudio, type ComfyVoice } from '../services/ttsApi'

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
let playbackRunId = 0

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

function playAudioBuffer(audioBuffer: AudioBuffer, runId: number): Promise<void> {
  const ctx = getAudioContext()
  return new Promise((resolve) => {
    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)
    source.onended = () => {
      if (currentSource === source && playbackRunId === runId) {
        currentSource = null
        stopProgress()
      }
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

async function speakLines(
  lines: string[],
  voice: ComfyVoice,
  messageId: string | undefined,
  runId: number
): Promise<void> {
  isPlaying.value = true
  totalLines.value = lines.length
  currentMessageId.value = messageId ?? null
  stopRequested = false

  const cached = messageId ? audioCache.get(messageId) : undefined
  const useCache = cached?.length === lines.length

  try {
    const audioBuffers: AudioBuffer[] = []
    const loadLine = (index: number): Promise<AudioBuffer> => {
      const cachedBuffer = useCache ? cached[index] : undefined
      if (cachedBuffer) return Promise.resolve(cachedBuffer)

      const line = lines[index]
      if (line === undefined) return Promise.reject(new Error('Missing TTS line'))
      return fetchTtsAudio(line, voice).then(decodeBuffer)
    }

    // 1行目の生成を先行開始。以降は再生中に次行を先読みして行間の待ちを隠す。
    let nextLoad: Promise<AudioBuffer> | null = loadLine(0)

    for (let i = 0; i < lines.length; i++) {
      if (stopRequested || playbackRunId !== runId) {
        nextLoad?.catch(() => {}) // 中断時、未使用の先読みの未処理リジェクトを抑制
        break
      }
      currentLine.value = i + 1
      currentText.value = lines[i] ?? ''

      const buf = await nextLoad!
      audioBuffers.push(buf)

      // 再生に入る前に次行の生成を投げておく（ComfyUIキューで先に処理させる）
      const following = i + 1 < lines.length ? loadLine(i + 1) : null
      following?.catch(() => {})
      nextLoad = following

      if (stopRequested || playbackRunId !== runId) break
      await playAudioBuffer(buf, runId)
      if (i < lines.length - 1 && !stopRequested && playbackRunId === runId) await sleep(1000)
    }

    if (messageId && audioBuffers.length === lines.length && playbackRunId === runId) {
      audioCache.set(messageId, audioBuffers)
    }
  } catch (e) {
    console.error('[TTS]', e)
  } finally {
    if (playbackRunId !== runId) return
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

  function speak(text: string, messageId?: string, personaId?: string | null): void {
    if (!settingsStore.ttsEnabled) return
    const lines = splitLines(text)
    if (lines.length === 0) return
    stop()
    const runId = ++playbackRunId
    const persona = personaStore.getPersonaById(personaId) ?? personaStore.activePersona
    const speakers = persona?.ttsVoices?.length
      ? persona.ttsVoices
      : persona?.ttsSpeakerEmbed
        ? [{ embed: persona.ttsSpeakerEmbed, weight: 1 }]
        : []
    const voice: ComfyVoice = { speakers }
    speakLines(lines, voice, messageId, runId)
  }

  function respeak(text: string, messageId?: string, personaId?: string | null): void {
    if (!settingsStore.ttsEnabled) return
    if (messageId) audioCache.delete(messageId)
    speak(text, messageId, personaId)
  }

  function stop(): void {
    playbackRunId += 1
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
