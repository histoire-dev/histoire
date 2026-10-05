import type { HistoireSettingsPatch } from '../types/settings.js'
import { HistoireSdkError } from '../types/error.js'
import { measureWireValue } from './size.js'

/** Throws typed validation failure without retaining untrusted payload. */
export function invalid(message: string): never {
  throw new HistoireSdkError('INVALID_ARGUMENT', message)
}

/** Requires plain data record, rejecting accessors before any field reads. */
export function wireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('Expected wire object')
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== null && prototype !== Object.prototype) return invalid('Expected plain wire object')
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key)) invalid('Forbidden wire key')
    if (!('value' in Object.getOwnPropertyDescriptor(value, key)!)) invalid('Wire accessors are forbidden')
  }
  return value as Record<string, unknown>
}

/** Nonempty bounded opaque identity, preserving exact contents. */
export function wireId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096
}

/** Structured target input; no concatenated identity parsing. */
export function validateHistoireTarget(value: unknown, optionalVariant = false): void {
  const input = wireRecord(value)
  if (!wireId(input.storyId) || !(input.variantId === null || wireId(input.variantId) || (optionalVariant && input.variantId === undefined))) invalid('Invalid story/variant target')
}

/** Exact additional HTTP(S) origin, rejecting paths, wildcards and opaque authority. */
export function validateEmbedOrigin(value: unknown): string {
  if (typeof value !== 'string') return invalid('Expected HTTP(S) origin')
  let url: URL
  try {
    url = new URL(value)
  }
  catch {
    return invalid('Invalid HTTP(S) origin')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.origin === 'null' || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash || value.includes('*') || value !== url.origin) {
    invalid('Expected exact scheme/host/port origin')
  }
  return url.origin
}

/** Validates host-owned settings before forwarding to any runtime. */
export function validateSettingsPatch(value: unknown): HistoireSettingsPatch {
  measureWireValue(value)
  const input = wireRecord(value)
  const allowed = ['responsiveWidth', 'responsiveHeight', 'rotate', 'backgroundColor', 'checkerboard', 'textDirection', 'colorScheme', 'globals']
  if (Object.keys(input).some(key => !allowed.includes(key))) invalid('Unknown preview setting')
  for (const key of ['responsiveWidth', 'responsiveHeight']) {
    const item = input[key]
    if (item !== undefined && !(key === 'responsiveHeight' && item === null) && !(typeof item === 'number' && Number.isFinite(item) && item > 0)) invalid('Invalid viewport size')
  }
  for (const key of ['rotate', 'checkerboard']) {
    if (input[key] !== undefined && typeof input[key] !== 'boolean') invalid('Expected boolean setting')
  }
  if (input.backgroundColor !== undefined && typeof input.backgroundColor !== 'string') invalid('Expected background string')
  if (input.textDirection !== undefined && !['ltr', 'rtl'].includes(input.textDirection as string)) invalid('Invalid text direction')
  if (input.colorScheme !== undefined && !['light', 'dark', 'auto'].includes(input.colorScheme as string)) invalid('Invalid color scheme')
  if (input.globals !== undefined) {
    const globals = wireRecord(input.globals)
    if (Object.keys(globals).length > 32) invalid('Too many globals')
    for (const [key, item] of Object.entries(globals)) {
      if (!/^[A-Z][\w-]{0,63}$/i.test(key)) invalid('Invalid global key')
      if (!(item === null || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item)) || typeof item === 'string')) invalid('Invalid global value')
      if (typeof item === 'string' && measureWireValue(item, { mode: 'state', maxBytes: 1024 }) > 1024) invalid('Global string too large')
    }
  }
  return input as HistoireSettingsPatch
}
