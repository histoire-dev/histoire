# AI agents <Badge type="tip" text="1.0-beta.2+" />

Histoire uses the [Agent Client Protocol](https://agentclientprotocol.com/) (ACP) to connect local coding agents to threads and canvas comments in development. Open **Settings › AI agents (ACP)**, enable local agents, then enable an agent from the registry or add your own. Complete the agent's authentication setup before choosing a model or sending a message.

Settings lists full [ACP registry](https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json), alongside existing custom commands. Configured default appears first, then enabled agents, then remaining catalog. Agents without compatible platform distribution remain visible but cannot be enabled.

Registry agents display their published logos in both themes. Missing or unavailable images use the bundled agent icon; logos stay separate from saved command preferences.

## Models and advanced settings

Set default **Model** and **Effort** for an enabled agent. Choose **Agent default** to use the adapter's own setting. Changing the model clears saved effort and loads compatible choices. Unsupported selectors stay disabled. Histoire reads these choices from a temporary ACP session without sending a prompt or exposing Histoire MCP tools.

Saved defaults apply to later comment sessions. If adapter rejects saved model or effort, comment still sends with accepted configuration and warning. Configuration changes retire existing processes before applying new preferences.

Open **Advanced settings** for a registry agent or **Configure** for a custom agent. Change its name, command, arguments, working directory, or environment there. Closing the section keeps unsaved changes.

A registry agent keeps its managed launch when you rename it or change its working directory. If you edit its command or arguments and choose **Save**, Histoire uses your command instead.

Removing configured registry agent leaves its catalog entry available. Removing custom agent removes its configuration. Neither deletes saved credentials.

## Registry and installation

Catalog uses validated 24-hour user cache. **Refresh** fetches current catalog. Offline refresh retains cached catalog and marks it stale; unavailable registry never erases local configuration.

Managed launches prefer `npx`, then `uvx`, then current-platform binary archive. Packages run with exact registry version and arguments; binaries download into Histoire user cache and verify registry checksums when provided. Opening catalog never downloads or launches adapters. Enabling agent while local agents are on allows model discovery to prepare and launch temporary adapter.

Install Node/npm or `uv` separately when required. Histoire does not install package managers. Existing custom commands and legacy presets keep their executable paths, credentials and IDs.

Caches live in `$XDG_CACHE_HOME/histoire` or `~/.cache/histoire` on Linux, `~/Library/Caches/histoire` on macOS, and `%LOCALAPPDATA%/histoire` on Windows. Binary versions cache separately so refreshing catalog does not delete executable used by active process.

Use **Add agent** to configure another ACP executable. Enter the command separately, then choose **Add argument** for each argument. Histoire runs the command directly without a shell, with working directories relative to the project root. Choose **Make default** to set the agent for new threads and comments, or **Ask each time** to choose when you send.

## Threads and context

Each thread, including canvas comments, keeps its own ACP session. Follow-ups reuse that session. Replies stream into the thread, and completed ACP tool diffs produce changed-file summaries when the adapter supplies them. Pending or failed tool edits do not count as completed changes. Summaries describe agent-reported diffs, rather than independently verifying filesystem contents; large diffs use the changed span for bounded line counting.

Context switches control what Histoire attaches:

- **Expose Histoire MCP tools** supplies the active MCP endpoint when the adapter supports HTTP MCP servers. Enable Histoire's MCP server separately to make an endpoint available.
- **Attach screenshot to comments** sends a canvas comment's captured screenshot.
- **Include story source and props** includes the story's source-file reference and captured props.

Story and variant IDs, selected-element selector, and the user-authored message remain available. Screenshots and image attachments are sent as images when the adapter accepts them, and as file links otherwise; mentioned files are sent as file links. See [AI threads and canvas comments](./ui-comments.md).

One prompt runs per agent process at a time. Other agents can work independently. Cancelled threads, process exits, and dev-server shutdown retire pending permission cards. Idle processes stop after five minutes; later threads acquire a fresh process/session. Configuration changes retire current processes before applying new preferences.

## Permissions

File-edit and terminal policies apply to ACP permission requests:

- **Ask** shows a card with **Deny**, **Allow once**, and **Allow for session**. Session approvals apply to that agent, comment session, and tool category; Histoire selects the adapter's `allow_once` option and remembers the choice locally.
- **Allow in src/** automatically allows file-edit requests whose declared paths all resolve inside the project's real `src/` directory, including new files. Requests without declared paths and symlink escapes require approval.
- **Allow** automatically approves declared terminal requests.
- **Never** denies that category without showing a card.

Agents own their file and terminal tools. Histoire does not provide ACP client-side filesystem or terminal execution capabilities. Permission mediation relies on the adapter sending ACP requests with accurate tool categories and locations; adapters that require client-hosted filesystem/terminal APIs are not supported by this client.

## Environment and persistence

In the agent's environment settings, enter the variable name and its value, then choose **Add** or **Replace**. Histoire shows saved variable names and keeps their values server-side. Updating one variable preserves the others. The write-only endpoint accepts same-origin JSON POST requests outside the HMR channel.

User preferences and credentials live in Histoire's private user file:

- Linux: `$XDG_CONFIG_HOME/histoire/agents.json`, or `~/.config/histoire/agents.json`.
- macOS: `~/Library/Application Support/histoire/agents.json`.
- Windows: `%LOCALAPPDATA%/histoire/agents.json`, with `%APPDATA%` fallback.

The file uses private permissions where supported. Preferences are scoped by project root; environment variables are scoped by agent ID. Histoire redacts known environment values from replies, stderr logs, errors, and permission details, including values split across reply chunks.

Preferences store deliberate field overrides. Changing one permission or context switch leaves untouched fields following current project defaults. **Reset to project** removes only the selected presets or permissions override; local opt-ins, context choices, and private environment values remain separate.

Older full preference snapshots have no record of which fields were deliberately edited. Migration preserves them as explicit local overrides. Reset a section, or save it successfully to the project, to restore project inheritance for that section.

**Save to project** shares safe command presets, registry identities, model/effort defaults or permission defaults through the config editor. It never writes environment values. Per-user opt-ins and context preferences remain local. See [configuration editing](../reference/config-codemod.md) for supported config shapes and conflict handling.

After verified save completion, only matching submitted presets or permission fields lose their local override. Later edits, private environment values, opt-ins, and context choices remain. Reconnecting checks completion of the existing save rather than submitting another write.

## Troubleshooting

**Not installed** means Histoire could not find the executable or package runner. Install the required package manager, or set the executable under **Advanced settings** or **Configure**. Use the redacted logs to distinguish startup timeout, ACP protocol mismatch, and process exit. Choose **Restart** to replace a running or failed agent process.
