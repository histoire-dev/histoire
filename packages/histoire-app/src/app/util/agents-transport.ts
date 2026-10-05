import { createAgentsStore } from '../stores/agents.js'
import { onUiDisconnect, onUiEvent, sendUiEvent } from './ui-channel.js'

/** Creates the dev-only transport; static workbenches never import this module. */
export function createDevAgentsStore() {
  const store = createAgentsStore({
    send: (event, value) => sendUiEvent(event as `histoire:ui:${string}`, value),
    snapshot: callback => onUiEvent('histoire:ui:agents-snapshot', callback),
    permission: callback => onUiEvent('histoire:ui:agent-permission', callback),
    resolved: callback => onUiEvent('histoire:ui:agent-permission-resolved', callback),
    disconnect: onUiDisconnect,
    async environment(agentId, env) {
      const endpoint = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/__histoire/agents/environment`
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ agentId, env }) })
      if (!response.ok) throw new Error('Cannot save agent environment')
    },
  })
  queueMicrotask(() => sendUiEvent('histoire:ui:ready', {}))
  return store
}
