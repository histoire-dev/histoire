# 16 — ACP agents

## Outcome and prerequisites

Depends on: 12, 15. Dev only. Confirm open decision 2 (agent presets) first.

Histoire acts as an Agent Client Protocol (ACP) client: it launches configured coding agents as subprocesses, connects over ACP (JSON-RPC over stdio), sends prompts (from comments in slice 17), streams replies, and mediates the agent's permission requests (file edits, terminal commands) through UI prompts. The Settings → AI agents section lists agents (status, default, command, working directory, env, restart, logs), permissions, and context options. Agents receive Histoire's MCP endpoint so they can inspect stories.

## Owned files

- Add `packages/histoire/src/node/acp/{manager,agent-process,client,permissions,prompt-context,types}.ts`.
- Add dependency on the official ACP TypeScript SDK (`@agentclientprotocol/sdk` or its current published name; verify on npm before adding) to the `histoire` package only.
- Add `packages/histoire/src/node/server/ui-channel/agents.ts` for `agents-snapshot`, `agent-permission`, `agent-permission-reply`.
- Add `agents` config per [contracts](contracts.md); user-level secrets (env) stored in the user's Histoire data dir (e.g. `~/.config/histoire/agents.json`, platform-appropriate), never in the project.
- Add `app/components/pages/settings/AgentsSection.vue`, `app/components/agents/PermissionPrompt.vue`, and `app/stores/agents.ts`.
- Register "Ask agent ›" in the context menu (slice 13).

## Tests first

1. Manager starts an agent only when `agents.enabled` and the agent is enabled; stops it on dev server close and on config change; crash marks `error` with the last stderr lines.
2. ACP handshake (initialize, session/new) against a fake agent process fixture; prompt round trip streams updates to the UI channel.
3. Permission requests map to prompts; `fileEdits: 'allow-src'` auto-allows paths under `src/` and asks otherwise; `never` denies without prompting; replies reach the agent.
4. Env values never appear in UI channel payloads, logs, or project files.
5. "Not installed" detection when the command cannot be resolved; install hint shown.
6. Prompt context includes the Histoire MCP endpoint when "Expose Histoire MCP tools" is on, story/variant IDs, props, selector, and screenshot path when attached.

## Implementation steps

1. One process per enabled agent, started lazily on first use; idle timeout configurable.
2. Use ACP sessions per comment thread (slice 17) so follow-ups keep context.
3. Permission prompts appear as a floating card above the inspector with allow once / always for this session / deny.
4. Logs view streams the agent's stderr in the settings section.

## Failure paths

Handshake failure, protocol version mismatch, and process exit are distinct states with readable messages. Pending permission prompts are auto-denied when the agent exits.

## Validation commands

~~~bash
pnpm --filter histoire build
pnpm --filter histoire test
pnpm --filter @histoire/app build
pnpm run lint
~~~

Manual: enable a real ACP agent (e.g. Claude Code ACP adapter) against `examples/vue3`, send a prompt, approve and deny an edit.

## Acceptance criteria

- Matches Settings — AI agents boards; agent lifecycle, prompts, and permissions work with at least one real ACP agent.
- No agent runs unless explicitly enabled; no secrets leave user-level storage.

## Non-goals

Running agents in static builds, cloud agents, Histoire-side file editing, chat UI beyond comment threads.

## Handoff

`AcpManager` API (`prompt(threadId, context, text)`, `onUpdate`, `cancel`) for slice 17.
