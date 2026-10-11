import type { HistoireBrowserConfig, HistoireBrowserSource } from '@histoire/shared'
import { resolve } from 'pathe'

/** Finite browser policies accepted from trusted project configuration. */
const browserSources = new Set<HistoireBrowserSource>([
  'auto',
  'headless-shell',
  'chromium',
  'chrome',
  'msedge',
  'executable',
])

/**
 * Validates trusted browser config and resolves custom paths against project root.
 * Browser file presence is checked during setup discovery, not config loading.
 * @param value User-supplied browser policy.
 * @param projectRoot Absolute or project-relative Histoire root.
 * @returns Validated config with a resolved executable path when selected.
 */
export function normalizeBrowserConfig(value: HistoireBrowserConfig | undefined, projectRoot: string): HistoireBrowserConfig {
  if (value === undefined) return { source: 'auto' }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Histoire config: browser must be an object')
  }

  const keys = Object.keys(value)
  if (keys.some(key => !['source', 'executablePath', 'reuse', 'idleTimeoutMs'].includes(key))) {
    throw new TypeError('Histoire config: browser has an unknown option')
  }

  const source = value.source ?? 'auto'
  if (typeof source !== 'string' || !browserSources.has(source as HistoireBrowserSource)) {
    throw new TypeError('Histoire config: browser.source must be auto, headless-shell, chromium, chrome, msedge, or executable')
  }
  const reuse = normalizeReuseConfig(value)

  if (source !== 'executable') {
    if (Object.hasOwn(value, 'executablePath')) {
      throw new TypeError('Histoire config: browser.executablePath requires browser.source to be executable')
    }
    return { source, ...reuse }
  }

  const executablePath = (value as { executablePath?: unknown }).executablePath
  if (typeof executablePath !== 'string' || executablePath.trim().length === 0) {
    throw new TypeError('Histoire config: browser.executablePath must be a non-empty path')
  }
  if (/[\0\r\n]/.test(executablePath)) {
    throw new TypeError('Histoire config: browser.executablePath must be a single filesystem path')
  }
  if (isUrl(executablePath)) {
    throw new TypeError('Histoire config: browser.executablePath must be a local filesystem path, not a URL')
  }
  if (looksLikeCommand(executablePath)) {
    throw new TypeError('Histoire config: browser.executablePath must be a path, not a command')
  }

  return { source: 'executable', executablePath: resolve(projectRoot, executablePath), ...reuse }
}

/** Validates process reuse policy separately so every source shares identical bounds. */
function normalizeReuseConfig(value: HistoireBrowserConfig): Pick<HistoireBrowserConfig, 'reuse' | 'idleTimeoutMs'> {
  const hasReuse = Object.hasOwn(value, 'reuse')
  if (hasReuse && typeof value.reuse !== 'boolean') {
    throw new TypeError('Histoire config: browser.reuse must be a boolean')
  }
  const hasIdleTimeout = Object.hasOwn(value, 'idleTimeoutMs')
  if (hasIdleTimeout && value.reuse !== true) {
    throw new TypeError('Histoire config: browser.idleTimeoutMs requires browser.reuse to be true')
  }
  if (hasIdleTimeout && !Number.isInteger(value.idleTimeoutMs)) {
    throw new TypeError('Histoire config: browser.idleTimeoutMs must be an integer')
  }
  if (hasIdleTimeout && (value.idleTimeoutMs! < 1_000 || value.idleTimeoutMs! > 300_000)) {
    throw new TypeError('Histoire config: browser.idleTimeoutMs must be between 1000 and 300000')
  }
  return {
    ...(hasReuse ? { reuse: value.reuse } : {}),
    ...(hasIdleTimeout ? { idleTimeoutMs: value.idleTimeoutMs } : {}),
  }
}

/** Rejects URI-like values while preserving Windows drive paths. */
function isUrl(value: string): boolean {
  return !/^[a-z]:[\\/]/i.test(value) && /^[a-z][a-z\d+.-]*:/i.test(value)
}

/** Rejects common shell command forms without splitting valid paths containing spaces. */
function looksLikeCommand(value: string): boolean {
  return /^(?:pnpm|npm|npx|yarn|bun|node|playwright|cmd(?:\.exe)?|powershell(?:\.exe)?|sh|bash|zsh)\s/i.test(value)
    || /^(?:chrome|chromium|msedge|google-chrome(?:-stable)?|microsoft-edge(?:-stable)?)\s+(?:--|-[a-z])/i.test(value)
    || (/^(?:[a-z]:[\\/]|\/|\\\\|~[\\/])/i.test(value) && /\s+--?\w/.test(value))
}
