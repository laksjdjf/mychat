const ALLOWED_TAGS = new Set([
  'a',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
])

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title']),
  th: new Set(['align']),
  td: new Set(['align']),
}

function isSafeUrl(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return true

  try {
    const url = new URL(trimmed, window.location.origin)
    return ['http:', 'https:', 'mailto:'].includes(url.protocol)
  } catch {
    return false
  }
}

function unwrapElement(el: Element) {
  const parent = el.parentNode
  if (!parent) return
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el)
  }
  parent.removeChild(el)
}

function sanitizeElement(el: Element) {
  const tag = el.tagName.toLowerCase()

  if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object') {
    el.remove()
    return
  }

  if (!ALLOWED_TAGS.has(tag)) {
    unwrapElement(el)
    return
  }

  const allowedAttrs = ALLOWED_ATTRS[tag] ?? new Set<string>()
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase()
    if (!allowedAttrs.has(name)) {
      el.removeAttribute(attr.name)
      continue
    }
    if (name === 'href' && !isSafeUrl(attr.value)) {
      el.removeAttribute(attr.name)
    }
  }

  if (tag === 'a') {
    el.setAttribute('rel', 'noopener noreferrer')
    el.setAttribute('target', '_blank')
  }
}

export function sanitizeHtml(html: string): string {
  const template = document.createElement('template')
  template.innerHTML = html

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT)
  const elements: Element[] = []
  let current = walker.nextNode()
  while (current) {
    elements.push(current as Element)
    current = walker.nextNode()
  }

  for (const el of elements) {
    if (el.parentNode) sanitizeElement(el)
  }

  return template.innerHTML
}
