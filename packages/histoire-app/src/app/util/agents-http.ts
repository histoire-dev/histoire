import type { UiAgentConfigOptions, UiAgentRegistry } from '@histoire/shared'

/** Safe catalog requests use HTTP so full registry never consumes socket budget. */
export function createAgentHttpTransport() {
  const prefix = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/__histoire/agents/`
  /** Every mutating/discovery request remains same-origin JSON. */
  async function request<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${prefix}${path}`, { credentials: 'same-origin', ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) })
    if (!response.ok) {
      const value = await response.json().catch(() => undefined)
      throw new Error(typeof value?.error === 'string' ? value.error.slice(0, 2000) : 'Agent request failed')
    }
    return response.json()
  }
  return {
    /** Browsing never launches any registry process. */
    registry: (force: boolean) => request<UiAgentRegistry>(force ? 'registry/refresh' : 'registry', force ? {} : undefined),
    /** Only explicitly enabled configured agents may create temporary sessions. */
    configOptions: (agentId: string, force: boolean) => request<UiAgentConfigOptions>('config-options', { agentId, force }),
  }
}
