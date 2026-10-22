import type { UiAgentConfigOptions, UiAgentRegistry } from '@histoire/shared'
import { jsonBody, requestJson, uiHttpUrl } from './http-json.js'

/**
 * Same-origin URL of a registry agent's logo, proxied by the dev server.
 * @param registryId ACP registry identity.
 */
export function agentIconUrl(registryId: string): string {
  return uiHttpUrl(`agents/icon/${encodeURIComponent(registryId)}`)
}

/** Safe catalog requests use HTTP so full registry never consumes socket budget. */
export function createAgentHttpTransport() {
  const prefix = uiHttpUrl('agents/')
  /** Every mutating/discovery request remains same-origin JSON. */
  function request<T>(path: string, body?: unknown): Promise<T> {
    return requestJson<T>(`${prefix}${path}`, body === undefined ? {} : jsonBody(body), 'Agent request failed')
  }
  return {
    /** Browsing never launches any registry process. */
    registry: (force: boolean) => request<UiAgentRegistry>(force ? 'registry/refresh' : 'registry', force ? {} : undefined),
    /** Only explicitly enabled configured agents may create temporary sessions. */
    configOptions: (agentId: string, force: boolean) => request<UiAgentConfigOptions>('config-options', { agentId, force }),
  }
}
