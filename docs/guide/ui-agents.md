# AI agents

Histoire can connect local coding agents to canvas comments through the [Agent Client Protocol](https://agentclientprotocol.com/). Agents run in development mode. Open **Settings → AI agents**, enable local agents, then enable an installed agent. Processes start on the first comment sent to that agent.

Built-in presets remain editable and disabled until enabled locally:

| Agent | Command | Optional installation |
| --- | --- | --- |
| Claude Code | `claude-agent-acp` | `npm install -g @agentclientprotocol/claude-agent-acp` |
| Gemini CLI | `gemini --acp` | `npm install -g @google/gemini-cli` |
| Codex | `codex-acp` | `npm install -g @agentclientprotocol/codex-acp` |

These commands come from the official [Claude adapter](https://github.com/agentclientprotocol/claude-agent-acp), [Codex adapter](https://github.com/agentclientprotocol/codex-acp), and [Gemini ACP documentation](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/acp-mode.md). Histoire does not install adapters or launch them merely by opening settings. Complete each agent's own authentication setup before sending a comment.

Use **Add agent** for another ACP executable. Arguments accept a JSON array of strings. Commands execute directly without a shell; set command and arguments separately. Working directories resolve from the project root. **Set default** chooses the destination for comments; **Ask each time** requires an explicit choice.

## Comments and context

Each comment thread keeps its own ACP session. Follow-ups reuse that session. Replies stream into the comment thread, and completed ACP tool diffs produce changed-file summaries when the adapter supplies them. Pending or failed tool edits do not count as completed changes. Summaries describe agent-reported diffs, rather than independently verifying filesystem contents; large diffs use the changed span for bounded line counting.

Context switches control what Histoire attaches:

- **Expose Histoire MCP tools** supplies the active MCP endpoint when the adapter supports HTTP MCP servers. Enable Histoire's MCP server separately to make an endpoint available.
- **Attach screenshot to comments** includes the stored screenshot path when available.
- **Include story source and props** includes the story's source-file reference and captured props.

Story and variant IDs, selected-element selector, and the user-authored comment remain available. Screenshot attachments are paths, rather than inline image bytes; an agent can inspect them through its own tools or Histoire MCP.

One prompt runs per agent process at a time. Other agents can work independently. Cancelled comments, process exits, and dev-server shutdown retire pending permission cards. Idle processes stop after five minutes; later comments acquire a fresh process/session. Configuration changes retire current processes before applying new preferences.

## Permissions

File-edit and terminal policies apply to ACP permission requests:

- **Ask** shows a card with **Deny**, **Allow once**, and **Allow for session**. Session approvals apply to that agent, comment session, and tool category; Histoire selects the adapter's `allow_once` option and remembers the choice locally.
- **Allow in src/** automatically allows file-edit requests whose declared paths all resolve inside the project's real `src/` directory, including new files. Requests without declared paths and symlink escapes require approval.
- **Allow** automatically approves declared terminal requests.
- **Never** denies that category without showing a card.

Agents own their file and terminal tools. Histoire does not provide ACP client-side filesystem or terminal execution capabilities. Permission mediation relies on the adapter sending ACP requests with accurate tool categories and locations; adapters that require client-hosted filesystem/terminal APIs are not supported by this client.

## Environment and persistence

Save environment variables through each agent's password field. Existing values are never returned to the browser; only variable names appear. Updates preserve previously saved variables. The credential endpoint is write-only, accepts same-origin JSON POST requests, and does not use the HMR channel.

User preferences and credentials live in Histoire's private user file:

- Linux: `$XDG_CONFIG_HOME/histoire/agents.json`, or `~/.config/histoire/agents.json`.
- macOS: `~/Library/Application Support/histoire/agents.json`.
- Windows: `%LOCALAPPDATA%/histoire/agents.json`, with `%APPDATA%` fallback.

The file uses private permissions where supported. Preferences are scoped by project root; environment variables are scoped by agent ID. Histoire redacts known environment values from replies, stderr logs, errors, and permission details, including values split across reply chunks.

Preferences store deliberate field overrides. Changing one permission or context switch leaves untouched fields following current project defaults. **Reset to project** removes only the selected presets or permissions override; local opt-ins, context choices, and private environment values remain separate.

Older full preference snapshots have no record of which fields were deliberately edited. Migration preserves them as explicit local overrides. Reset a section, or save it successfully to the project, to restore project inheritance for that section.

**Save to project** shares safe command presets or permission defaults through the config editor. It never writes environment values. Per-user opt-ins and context preferences remain local. See [configuration editing](../reference/config-codemod.md) for supported config shapes and conflict handling.

After verified save completion, only matching submitted presets or permission fields lose their local override. Later edits, private environment values, opt-ins, and context choices remain. Reconnecting checks completion of the existing save rather than submitting another write.

## Troubleshooting

**Not installed** means the executable could not be found. Install the adapter separately or choose its absolute executable path. Logs show bounded, redacted stderr output. Initialization timeout, ACP protocol mismatch, and process exit have separate messages. **Restart** retires a running or failed process and reacquires it; agents that have never run remain lazy.

Automated coverage uses a test-only ACP process for initialization, thread sessions, streaming, permission choices, crashes, secret redaction, diff summaries, and teardown. Real-agent authentication and interactive edit approval remain manual validation steps.
