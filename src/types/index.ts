export interface Message {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  reasoning?: string  // reasoning_content フィールド対応
  timestamp: number
}

export interface ChatSession {
  id: string
  name: string
  messages: Message[]
  personaId: string | null
  createdAt: number
  updatedAt: number
}

// 1つの声（speaker embedding）とマージ時の重み
export interface SpeakerMix {
  embed: string // speaker embedding 名（例: xxx.safetensors）
  weight: number // concatマージ時の寄与（per-voice gain）。1.0が基準
}

export interface Persona {
  id: string
  name: string
  personality: string
  scenario: string
  avatarUrl: string
  avatarFocalPoint?: { x: number; y: number } // チャット用トリミング位置 (0-100%)
  ttsVoices?: SpeakerMix[] // TTSの声（最大4つブレンド）。ComfyUI Irodori-TTS の speaker embedding
  ttsSpeakerEmbed?: string // (旧) 単一指定。ttsVoices が無い場合のフォールバック
  customFields: Record<string, string>
}

export interface SystemPromptTemplate {
  id: string
  name: string
  template: string
}

export interface LlmRequestMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// LLM生成パラメータ（設定タブで調整・localStorage永続化）
export interface GenerationParams {
  temperature: number
  topP: number
  maxTokens: number | null // null = サーバー既定（無制限）
  seed: number | null // null = ランダム
}
