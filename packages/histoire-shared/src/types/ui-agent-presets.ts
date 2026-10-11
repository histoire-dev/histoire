import type { UiAgentSettings } from './ui-agents.js'

/** Stable legacy IDs and fallback commands; fresh presets use managed registry launch. */
export const ACP_PRESETS: UiAgentSettings['presets'] = [
  { id: 'claude', registryId: 'claude-acp', name: 'Claude Code', command: 'claude-agent-acp', default: true },
  { id: 'gemini', registryId: 'gemini', name: 'Gemini CLI', command: 'gemini', args: ['--acp'] },
  { id: 'codex', registryId: 'codex-acp', name: 'Codex', command: 'codex-acp' },
]

/** Legacy preset IDs keep credential/comment ownership without catalog duplicates. */
export const ACP_REGISTRY_ALIASES: Record<string, string> = { claude: 'claude-acp', codex: 'codex-acp' }

/** Informational installation hints for legacy/custom command overrides. */
export const ACP_INSTALL_HINTS: Record<string, string> = {
  claude: 'npm install -g @agentclientprotocol/claude-agent-acp',
  gemini: 'npm install -g @google/gemini-cli',
  codex: 'npm install -g @agentclientprotocol/codex-acp',
}
