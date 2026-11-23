# AI threads and canvas comments <Badge type="tip" text="1.0-beta.2+" />

Open **AI** in the left rail to see conversations for this project. Start a free-form thread or pin a canvas comment to a story variant. Configure and enable an agent in [AI agent settings](./ui-agents.md) before sending a message. The same file-edit and terminal permissions apply to both kinds of thread.

## Threads

Choose **New thread** in the AI tab. Keep the selected story's chip for context or remove it to send a project-wide request. Write your message, pick an agent, and send.

Each thread keeps its own ACP session for follow-ups. Histoire streams the reply and saves the completed message, steps, and reported changes. Links to stories the agent creates or changes appear at the end of the thread.

The list shows threads of the selected story first, then the rest of the project. **Archive** hides a thread without deleting it; the archive toggle in the toolbar switches the list to archived threads only.

## Canvas comments

Choose the **Comment** tool or press `C`, then click the point you want to pin. To pin a comment at the center of a frame, choose **Comment for AI** from its menu.

Histoire attaches the story and variant, the element selector when available, and JSON-safe state and prop overrides. Choose **Capture screenshot** in the attachment menu (`Ctrl`/`⌘`+`Shift`+`S`) to save an image of the frame with the comment.

Pins follow their frame during canvas pan and zoom, and only show while the Comment tool is active. In the AI tab, pinned threads show their pin number; selecting one opens it on the canvas. While the archive is shown, only archived pins appear. Threads of removed stories and variants stay readable in the AI tab and can still be reviewed or deleted.

## Writing messages

- `@` searches project files and inserts a mention; mentioned files are linked for the agent.
- `/` lists the slash commands the agent announced. A message starting with an announced command is sent as is.
- Choose **Add to message**, paste a file, or drop it on the message box. **Add to message** also lists recent screenshots.
- The agent chip opens the session settings: switch agent, model, reasoning effort and mode, when the agent offers them.

The destination follows **Settings → AI agents → Canvas comments go to**. **Default agent** selects your configured default while preserving a manual choice. **Ask each time** leaves the picker empty until you choose an agent.

## Local storage

Threads are created lazily in `.histoire/threads.json`, and attachments in `.histoire/attachments/`. They contain original messages, canvas anchors, optional captured props and screenshots, agent replies, and timestamps. Keep `.histoire/` ignored for local review work; it can contain captured application data. Uploads that no thread references are removed after an hour.

```ts
export default defineConfig({
  comments: {
    // Disable canvas comments; free-form threads stay available.
    enabled: false,
  },
})
```

`comments.enabled: false` hides the Comment tool and refuses new pinned threads. Static books do not expose the development channel or read these files.
