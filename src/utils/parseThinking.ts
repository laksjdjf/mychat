export interface ParsedThinking {
  /** 思考部分。思考が無い場合は null */
  thinking: string | null
  /** 表示用の本文 */
  answer: string
  /** 思考タグが開いたままストリーミング中か */
  streaming: boolean
}

/**
 * メッセージ本文から思考(reasoning)部分と本文を分離する。
 *
 * 優先順位:
 *  1. reasoning フィールド（reasoning_content 由来）
 *  2. <think>...</think> 形式
 *  3. <|channel>thought...<channel|> 形式 (Qwen系)
 *
 * MessageBubble（思考トグル表示）と VNMode（本文のみ表示）の両方から使う。
 */
export function parseThinking(
  content: string,
  reasoning: string | undefined,
  isGenerating = false
): ParsedThinking {
  // reasoning_content フィールドがある場合（優先）
  if (reasoning !== undefined) {
    return {
      thinking: reasoning,
      answer: content,
      streaming: isGenerating && !content,
    }
  }

  // <think>...</think> 形式
  const thinkClosed = content.match(/^<think>([\s\S]*?)<\/think>\s*([\s\S]*)$/)
  if (thinkClosed) {
    return {
      thinking: (thinkClosed[1] ?? '').trim(),
      answer: (thinkClosed[2] ?? '').trim(),
      streaming: false,
    }
  }
  const thinkOpen = content.match(/^<think>([\s\S]*)$/)
  if (thinkOpen) return { thinking: thinkOpen[1] ?? '', answer: '', streaming: true }

  // <|channel>thought...<channel|> 形式 (Qwen系)
  const channelClosed = content.match(/^<\|channel>thought\n?([\s\S]*?)<channel\|>\n?([\s\S]*)$/)
  if (channelClosed) {
    return {
      thinking: (channelClosed[1] ?? '').trim(),
      answer: (channelClosed[2] ?? '').trim(),
      streaming: false,
    }
  }
  const channelOpen = content.match(/^<\|channel>thought\n?([\s\S]*)$/)
  if (channelOpen) return { thinking: channelOpen[1] ?? '', answer: '', streaming: true }

  return { thinking: null, answer: content, streaming: false }
}
