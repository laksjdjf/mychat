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
  refWav?: string // TTS参照音声パス
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
