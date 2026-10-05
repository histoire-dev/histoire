import type { UiAgentSettings } from './ui-agents.js'

/** Official installed executable names; presets require explicit local opt-in. */
export const ACP_PRESETS: UiAgentSettings['presets'] = [
  { id: 'claude', name: 'Claude Code', command: 'claude-agent-acp', default: true },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini', args: ['--acp'] },
  { id: 'codex', name: 'Codex', command: 'codex-acp' },
]

/** Install suggestions are informational; Histoire never installs adapters. */
export const ACP_INSTALL_HINTS: Record<string, string> = {
  claude: 'npm install -g @agentclientprotocol/claude-agent-acp',
  gemini: 'npm install -g @google/gemini-cli',
  codex: 'npm install -g @agentclientprotocol/codex-acp',
}
