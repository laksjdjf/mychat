export async function fetchTtsAudio(
  text: string,
  refWav?: string
): Promise<ArrayBuffer> {
  const body: Record<string, unknown> = { text }
  if (refWav) {
    body.ref_wav = refWav
  } else {
    body.no_ref = true
  }

  const resp = await fetch('/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    throw new Error(`TTS error: ${resp.status} ${resp.statusText}`)
  }

  return resp.arrayBuffer()
}
