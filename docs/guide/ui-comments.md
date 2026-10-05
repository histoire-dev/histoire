# Comments for AI

In development, choose the Comment tool, press `C`, or choose **Comment for AI** from a frame menu. Click a preview point to open its composer. Histoire attaches the exact story and variant, the picked element selector when available, and JSON-safe state and prop overrides. **Attach screenshot** uses the existing screenshot executor and records its generated project-relative image path.

Write a message and choose **Save draft**, or select an enabled ACP agent and choose **Send**. When no agent is available, **Set up an agent** opens AI agent settings. Agents remain disabled until explicitly configured and enabled. File-edit and terminal permissions use the same ACP policy as other agent work; comments do not bypass permission prompts.

The destination follows **Settings → AI agents → Canvas comments go to**. **Default agent** selects your configured default while preserving a manual choice. **Ask each time** leaves the picker empty until you choose an agent for that draft or bulk send. Working threads display live reply text; the completed reply and reported file changes become persisted history.

The Comments pane groups annotations by story and supports **Open**, **Resolved**, and **All** filters. **Send N open** delivers unsent drafts in order. Each comment owns a separate ACP conversation. Agent replies preserve reported file edits; **Reply** continues that conversation. Failed agent requests return the annotation to draft so it can be retried.

Pins follow their preview during canvas pan and zoom. A preview removed by the live frame budget temporarily hides its pins. **Resolve** preserves the conversation and hides its pin; the pane filter control can reveal resolved pins. Removed stories and variants retain their annotations as **Orphaned** threads, which can still be reviewed or deleted.

## Local storage

Comments are created lazily in `.histoire/comments.json`. The file contains versioned JSON with original messages, coordinate/selector anchors, optional captured props/screenshots, agent replies, and timestamps. `.histoire/` is ignored in example projects. Keep it ignored for local review work; commit `comments.json` deliberately only when sharing its contents is intended. It can contain captured application data.

```ts
export default defineConfig({
  comments: {
    enabled: true,
    file: '.histoire/comments.json',
  },
})
```

`comments.file` must remain inside the project and cannot traverse symlinks. `comments.enabled: false` disables reads, writes, and comment actions. Static books do not expose the development channel or read this file.
