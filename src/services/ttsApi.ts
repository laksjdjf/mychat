import { synthesizeViaComfy, type ComfyVoice } from './tts/comfyProvider'

export type { ComfyVoice }

/**
 * テキスト1行 → 音声(ArrayBuffer)。
 * バックエンドは ComfyUI(Irodori-TTS)。再生エンジン(useTts)はこの関数だけに依存する。
 */
export function fetchTtsAudio(
  text: string,
  voice: ComfyVoice,
  signal?: AbortSignal
): Promise<ArrayBuffer> {
  return synthesizeViaComfy(text, voice, signal)
}
