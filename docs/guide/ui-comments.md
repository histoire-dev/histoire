# AI threads and canvas comments <Badge type="tip" text="1.0-beta.2+" />

In development, the **AI** tab in the left rail holds every conversation with your ACP agents. A thread is either free-form or a **canvas comment**: a thread pinned to a point of a story variant. Agents remain disabled until explicitly configured and enabled in [AI agent settings](./ui-agents.md). File-edit and terminal permissions use the same ACP policy as other agent work.

## Threads

Choose **+** in the AI tab to start a thread. The selected story is offered as context; remove its chip to send a project-wide request. Write a message, pick an agent and send. Each thread keeps its own ACP session, so replies continue the same conversation. Working threads display live output; the completed reply, its steps and reported file changes become persisted history. Stories the agent creates or changes are linked at the end of the thread.

The list shows threads of the selected story first, then the rest of the project. **Archive** hides a thread without deleting it; the archive toggle in the toolbar switches the list to archived threads only.

## Canvas comments

Choose the Comment tool, press `C`, or choose **Comment for AI** from a frame menu, then click a point of a variant. Histoire attaches the exact story and variant, the picked element selector when available, and JSON-safe state and prop overrides. **Capture screenshot** in the attach menu (`Ctrl`/`⌘`+`Shift`+`S`) stores a screenshot of the frame with the comment.

Pins follow their frame during canvas pan and zoom, and only show while the Comment tool is active. In the AI tab, pinned threads show their pin number; selecting one opens it on the canvas. While the archive is shown, only archived pins appear. Threads of removed stories and variants stay readable in the AI tab and can still be reviewed or deleted.

## Writing messages

- `@` searches project files and inserts a mention; mentioned files are linked for the agent.
- `/` lists the slash commands the agent announced. A message starting with an announced command is sent as is.
- Attach files with **+**, by pasting or by dropping them on the message box. Recent screenshots can be attached from the same menu.
- The agent chip opens the session settings: switch agent, model, reasoning effort and mode, when the agent offers them.

The destination follows **Settings → AI agents → Canvas comments go to**. **Default agent** selects your configured default while preserving a manual choice. **Ask each time** leaves the picker empty until you choose an agent.

## Local storage

Threads are created lazily in `.histoire/threads.json`, and attachments in `.histoire/attachments/`. They contain original messages, canvas anchors, optional captured props and screenshots, agent replies, and timestamps. Keep `.histoire/` ignored for local review work; it can contain captured application data. Uploads that no thread references are removed after an hour.

Projects that used the earlier `comments.json` storage are migrated on the next development start: its comments become pinned threads, and the file is renamed to `comments.migrated.json`.

```ts
export default defineConfig({
  comments: {
    // Disable canvas comments; free-form threads stay available.
    enabled: false,
  },
})
```

`comments.enabled: false` hides the Comment tool and refuses new pinned threads. Static books do not expose the development channel or read these files.
