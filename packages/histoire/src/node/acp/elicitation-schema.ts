import type { CreateElicitationRequest, ElicitationPropertySchema } from '@agentclientprotocol/sdk'
import type { UiAgentElicitationField, UiAgentElicitationForm, UiAgentElicitationOption, UiAgentElicitationUrl } from '@histoire/shared'

/** Card content projected from one agent request, before broker identity is added. */
export type ProjectedElicitation
  = | Pick<UiAgentElicitationForm, 'mode' | 'message' | 'title' | 'description' | 'fields'>
    | (Pick<UiAgentElicitationUrl, 'mode' | 'message' | 'url' | 'host'> & { elicitationId: string })

/** Most fields one form may show. */
const FIELD_LIMIT = 32
/** Most options one choice field may show. */
const OPTION_LIMIT = 100
/** String formats the form knows how to collect. */
const FORMATS = new Set(['email', 'uri', 'date', 'date-time'])
/** Loopback hosts allowed over plain http (local OAuth callbacks). */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Optional bounded redacted text. */
function label(value: unknown, limit: number, sanitize: (text: string) => string): string | undefined {
  return typeof value === 'string' && value.trim() ? sanitize(value).slice(0, limit) : undefined
}

/** Optional finite number. */
function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Copies only defined properties so projected cards stay compact. */
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}

/**
 * Titled (`oneOf` / `anyOf`) or plain (`enum`) options; undefined when invalid.
 * @param titled Titled enum options.
 * @param plain Untitled enum values.
 * @param sanitize Redacts known secrets.
 */
function options(titled: unknown, plain: unknown, sanitize: (text: string) => string): UiAgentElicitationOption[] | undefined {
  const source = Array.isArray(titled)
    ? titled.map((item: any) => ({ value: item?.const, label: item?.title, description: item?.description }))
    : Array.isArray(plain) ? plain.map(item => ({ value: item, label: item, description: undefined })) : undefined
  if (!source?.length || source.length > OPTION_LIMIT || source.some(item => typeof item.value !== 'string' || item.value.length > 1000)) return undefined
  return source.map(item => defined({ value: item.value as string, label: label(item.label, 200, sanitize) ?? item.value as string, description: label(item.description, 1000, sanitize) }))
}

/**
 * Projects one ACP property schema; undefined for types the form cannot collect.
 * @param key Property name.
 * @param schema Agent property schema.
 * @param required Whether the schema requires it.
 * @param sanitize Redacts known secrets.
 */
function field(key: string, schema: ElicitationPropertySchema, required: boolean, sanitize: (text: string) => string): UiAgentElicitationField | undefined {
  const input = schema as Record<string, any>
  const base = { key, required, title: label(input.title, 200, sanitize), description: label(input.description, 1000, sanitize) }
  switch (input.type) {
    case 'string': {
      if (input.oneOf || input.enum) {
        const choices = options(input.oneOf, input.enum, sanitize)
        return choices && defined({ ...base, type: 'choice', options: choices, default: typeof input.default === 'string' ? input.default : undefined })
      }
      return defined({ ...base, type: 'text', format: FORMATS.has(input.format) ? input.format : undefined, minLength: finite(input.minLength), maxLength: finite(input.maxLength), pattern: typeof input.pattern === 'string' && input.pattern.length <= 500 ? input.pattern : undefined, default: typeof input.default === 'string' ? input.default : undefined })
    }
    case 'number':
    case 'integer':
      return defined({ ...base, type: 'number', integer: input.type === 'integer', minimum: finite(input.minimum), maximum: finite(input.maximum), default: finite(input.default) })
    case 'boolean':
      return defined({ ...base, type: 'boolean', default: typeof input.default === 'boolean' ? input.default : undefined })
    case 'array': {
      const choices = options(input.items?.anyOf, input.items?.enum, sanitize)
      const initial = Array.isArray(input.default) && input.default.every((item: unknown) => typeof item === 'string') ? input.default as string[] : undefined
      return choices && defined({ ...base, type: 'multi-choice', options: choices, minItems: finite(input.minItems), maxItems: finite(input.maxItems), default: initial })
    }
    default:
      return undefined
  }
}

/**
 * Validated link: https anywhere, plain http only on loopback, never altered by redaction.
 * @param value Agent URL.
 * @param sanitize Redacts known secrets.
 */
function safeUrl(value: unknown, sanitize: (text: string) => string): URL | undefined {
  if (typeof value !== 'string' || value.length > 4096 || sanitize(value) !== value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.has(url.hostname)) ? url : undefined
  }
  catch { return undefined }
}

/**
 * Projects an ACP elicitation into safe card content.
 * Returns undefined when the request cannot be shown faithfully, so the agent gets a decline.
 * @param request Agent elicitation request.
 * @param sanitize Redacts known secrets.
 */
export function projectElicitation(request: CreateElicitationRequest, sanitize: (text: string) => string): ProjectedElicitation | undefined {
  const message = label(request.message, 4000, sanitize) ?? 'The agent needs your input'
  if (request.mode === 'url') {
    const input = request as Extract<CreateElicitationRequest, { mode: 'url' }>
    const url = safeUrl(input.url, sanitize)
    return url && typeof input.elicitationId === 'string' ? { mode: 'url', message, url: url.href, host: url.host, elicitationId: input.elicitationId } : undefined
  }
  if (request.mode !== 'form') return undefined
  const schema = (request as Extract<CreateElicitationRequest, { mode: 'form' }>).requestedSchema
  const entries = Object.entries(schema?.properties ?? {})
  if (!entries.length || entries.length > FIELD_LIMIT) return undefined
  const required = new Set(Array.isArray(schema.required) ? schema.required : [])
  const fields: UiAgentElicitationField[] = []
  for (const [key, property] of entries) {
    const projected = key && key.length <= 64 ? field(key, property, required.has(key), sanitize) : undefined
    if (!projected) return undefined
    fields.push(projected)
  }
  return defined({ mode: 'form' as const, message, title: label(schema.title, 200, sanitize), description: label(schema.description, 1000, sanitize), fields })
}
