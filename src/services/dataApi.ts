import type { Persona, SystemPromptTemplate } from '../types'

const BASE = '/store'

// --- Personas ---

export async function fetchPersonas(): Promise<Persona[]> {
  const r = await fetch(`${BASE}/personas`)
  if (!r.ok) throw new Error(`fetchPersonas: ${r.status}`)
  return r.json()
}

export async function savePersona(persona: Persona): Promise<void> {
  await fetch(`${BASE}/personas/${persona.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(persona),
  })
}

export async function deletePersonaFile(id: string): Promise<void> {
  await fetch(`${BASE}/personas/${id}`, { method: 'DELETE' })
}

// --- Templates ---

export async function fetchTemplates(): Promise<SystemPromptTemplate[]> {
  const r = await fetch(`${BASE}/templates`)
  if (!r.ok) throw new Error(`fetchTemplates: ${r.status}`)
  return r.json()
}

export async function saveTemplate(template: SystemPromptTemplate): Promise<void> {
  await fetch(`${BASE}/templates/${template.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(template),
  })
}

export async function deleteTemplateFile(id: string): Promise<void> {
  await fetch(`${BASE}/templates/${id}`, { method: 'DELETE' })
}
