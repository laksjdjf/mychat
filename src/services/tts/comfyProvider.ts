import { generateId } from '../../utils/id'
import type { SpeakerMix } from '../../types'
import { irodoriChatWorkflow, IRODORI_CHAT_NODES } from './irodoriChatWorkflow'
import type { ComfyWorkflow } from './types'

// vite が /comfy → ComfyUI(127.0.0.1:8188) にプロキシする
const BASE = '/comfy'

// ポーリング設定
const POLL_INTERVAL_MS = 250
const TIMEOUT_MS = 180_000 // コールドロード(初回~12s)に余裕を持たせる

export interface ComfyVoice {
  /** 声（最大4つ）。空ならワークフロー既定 */
  speakers?: SpeakerMix[]
}

const MERGE_SLOTS = ['a', 'b', 'c', 'd'] as const

interface AudioRef {
  filename: string
  subfolder: string
  type: string
}

// ComfyUI への接続を識別する client_id（モジュール生存中は固定）
const clientId = generateId()

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ワークフローを複製し、テキスト・声・noise seed をノードIDで差し込む
function buildWorkflow(text: string, voice: ComfyVoice): ComfyWorkflow {
  const wf = structuredClone(irodoriChatWorkflow)
  const N = IRODORI_CHAT_NODES

  const textNode = wf[N.text]
  const noiseNode = wf[N.noiseSeed]

  if (textNode) textNode.inputs.value = text
  // 生成ゆらぎは毎回ランダム（同じ行でも再生成で別テイクになる）
  if (noiseNode) noiseNode.inputs.noise_seed = Math.floor(Math.random() * 2 ** 31)

  applySpeakers(wf, voice.speakers ?? [])

  return wf
}

// 声の数に応じて話者チェーンを組み立てる:
//   1声  → SpeakerEmbedLoader
//   2-4声 → SpeakerEmbedLoader×N → SpeakerEmbedMerge(concat,重み)
function applySpeakers(wf: ComfyWorkflow, speakers: SpeakerMix[]): void {
  const N = IRODORI_CHAT_NODES
  const picks = speakers.filter((s) => s.embed).slice(0, 4)
  if (picks.length === 0) return // 声未指定 → ベースのローダ(28)のまま（既定解決は呼び出し側）

  // ベースの単一ローダ(28)を消し、動的に作り直す
  delete wf[N.speakerEmbed]

  const mergeInputs: Record<string, unknown> = { mode: 'concat' }
  picks.forEach((s, i) => {
    const loaderId = `spk${i}`
    wf[loaderId] = { class_type: 'IrodoriSpeakerEmbedLoader', inputs: { embed_name: s.embed } }
    const slot = MERGE_SLOTS[i]!
    mergeInputs[`speaker_embed_${slot}`] = [loaderId, 0]
    mergeInputs[`weight_${slot}`] = s.weight ?? 1
  })

  let source: [string, number]
  if (picks.length === 1) {
    source = ['spk0', 0]
  } else {
    wf['spkmerge'] = { class_type: 'IrodoriSpeakerEmbedMerge', inputs: mergeInputs }
    source = ['spkmerge', 0]
  }

  setSpeakerSource(wf, source)
}

function setSpeakerSource(wf: ComfyWorkflow, source: [string, number]): void {
  for (const nodeId of ['22', '36']) {
    const node = wf[nodeId]
    if (node) node.inputs.speaker_embed = source
  }
}

// /history をポーリングして出力音声の参照を得る
async function waitForAudio(promptId: string, signal?: AbortSignal): Promise<AudioRef> {
  const deadline = Date.now() + TIMEOUT_MS

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const r = await fetch(`${BASE}/history/${promptId}`, { signal })
    if (r.ok) {
      const hist = await r.json()
      const entry = hist[promptId]
      if (entry) {
        if (entry.status?.status_str === 'error') {
          throw new Error(`ComfyUI 生成エラー: ${describeError(entry)}`)
        }
        const audio = entry.outputs?.[IRODORI_CHAT_NODES.output]?.audio?.[0]
        if (audio?.filename) {
          return {
            filename: audio.filename,
            subfolder: audio.subfolder ?? '',
            type: audio.type ?? 'output',
          }
        }
        // completed なのに音声が無い → 異常終了扱い
        if (entry.status?.completed) {
          throw new Error('ComfyUI: 音声出力が見つかりません')
        }
      }
    }
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error('ComfyUI: 生成がタイムアウトしました')
}

function describeError(entry: unknown): string {
  const messages = (entry as { status?: { messages?: unknown[] } })?.status?.messages
  if (!Array.isArray(messages)) return '不明なエラー'
  for (const m of messages) {
    if (Array.isArray(m) && m[0] === 'execution_error') {
      const info = m[1] as { exception_message?: string; node_type?: string } | undefined
      if (info?.exception_message) return `${info.node_type ?? ''} ${info.exception_message}`.trim()
    }
  }
  return '不明なエラー'
}

/**
 * テキスト1行を ComfyUI Irodori-TTS で音声合成し、MP3 を ArrayBuffer で返す。
 *   1. ワークフロー投入 (POST /comfy/prompt)
 *   2. /comfy/history/{id} ポーリングで完了待ち
 *   3. /comfy/view で音声取得
 */
export async function synthesizeViaComfy(
  text: string,
  voice: ComfyVoice,
  signal?: AbortSignal
): Promise<ArrayBuffer> {
  // 声未指定なら ComfyUI から取得した先頭の声を既定にする（名前をソースに持たない）
  let speakers = voice.speakers?.filter((s) => s.embed) ?? []
  if (speakers.length === 0) {
    const first = (await fetchSpeakerEmbeds().catch(() => []))[0]
    if (first) speakers = [{ embed: first, weight: 1 }]
  }
  const effectiveVoice: ComfyVoice = { ...voice, speakers }

  const promptRes = await fetch(`${BASE}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: buildWorkflow(text, effectiveVoice), client_id: clientId }),
    signal,
  })
  if (!promptRes.ok) {
    throw new Error(`ComfyUI prompt: ${promptRes.status} ${promptRes.statusText}`)
  }
  const { prompt_id: promptId } = await promptRes.json()
  if (!promptId) throw new Error('ComfyUI: prompt_id が返りませんでした')

  const audio = await waitForAudio(promptId, signal)

  const params = new URLSearchParams({
    filename: audio.filename,
    subfolder: audio.subfolder,
    type: audio.type,
  })
  const viewRes = await fetch(`${BASE}/view?${params.toString()}`, { signal })
  if (!viewRes.ok) {
    throw new Error(`ComfyUI view: ${viewRes.status} ${viewRes.statusText}`)
  }
  return viewRes.arrayBuffer()
}

const SPEAKER_LOADER_NODE = 'IrodoriSpeakerEmbedLoader'
let speakerEmbedCache: Promise<string[]> | null = null

/**
 * 利用可能な speaker embedding 名を ComfyUI から動的に取得する。
 * IrodoriSpeakerEmbedLoader の embed_name COMBO = models/speaker_embeddings/*.safetensors の実体。
 * 結果はメモ化（force=true で再取得）。失敗時はキャッシュせず次回リトライ可能。
 */
export function fetchSpeakerEmbeds(force = false): Promise<string[]> {
  if (force) speakerEmbedCache = null
  if (!speakerEmbedCache) {
    speakerEmbedCache = (async () => {
      try {
        const r = await fetch(`${BASE}/object_info/${SPEAKER_LOADER_NODE}`)
        if (!r.ok) throw new Error(`ComfyUI object_info: ${r.status}`)
        const info = await r.json()
        const options = info?.[SPEAKER_LOADER_NODE]?.input?.required?.embed_name?.[1]?.options
        if (!Array.isArray(options)) throw new Error('embed_name options が見つかりません')
        return options as string[]
      } catch (e) {
        speakerEmbedCache = null
        throw e
      }
    })()
  }
  return speakerEmbedCache
}
