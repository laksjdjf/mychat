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

export interface Persona {
  id: string
  name: string
  personality: string
  scenario: string
  avatarUrl: string
  avatarFocalPoint?: { x: number; y: number } // チャット用トリミング位置 (0-100%)
  ttsSpeakerEmbed?: string // TTSの声（ComfyUI Irodori-TTS の speaker embedding 名）
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
