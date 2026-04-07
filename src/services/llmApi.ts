import type { LlmRequestMessage } from '../types'

export interface StreamChunk {
  content?: string
  reasoning?: string
}

export async function* streamChatCompletion(
  endpoint: string,
  messages: LlmRequestMessage[],
  signal: AbortSignal
): AsyncGenerator<StreamChunk> {
  const response = await fetch(`${endpoint}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      stream: true,
      temperature: 0.8,
    }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status} ${response.statusText}`)
  }
  if (!response.body) {
    throw new Error('No response body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') return

      try {
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta
        const chunk: StreamChunk = {}
        if (delta?.content) chunk.content = delta.content
        if (delta?.reasoning_content) chunk.reasoning = delta.reasoning_content
        if (chunk.content || chunk.reasoning) yield chunk
      } catch {
        // skip malformed JSON chunks
      }
    }
  }
}
