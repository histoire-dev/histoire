# 17 — Comments for AI

## Outcome and prerequisites

Depends on: 13, 16. Dev only. Confirm open decision 1 (storage) first.

With the Comment tool (toolbar), the "Comment for AI" menu item, or `C`, the user clicks a point in a frame; Histoire picks the element under it and opens a composer showing the attached context (variant, selector, props, screenshot), the message, an agent picker, and Send. Pins mark comments on frames. A thread shows the user's comment and the agent's replies (with changed files), Reply, and Resolve. The Comments rail pane lists comments grouped by story with Open / Resolved / All filters and "Send N open to <agent>".

## Owned files

- Add `packages/histoire/src/node/comments/{store,file,ids,types}.ts` (atomic JSON file per [contracts](contracts.md)) and `packages/histoire/src/node/server/ui-channel/comments.ts`.
- Add `ELEMENT_PICK_REQUEST`/`ELEMENT_PICK_RESULT` to the preview protocol and a runtime handler module.
- Add `app/stores/comments.ts`, `app/components/comments/{CommentPin,CommentComposer,CommentThread}.vue`, and `app/components/panes/comments/{CommentsPanel,CommentsList,CommentRow}.vue`.
- Register the toolbar comment tool (05) and menu action (13).
- Use slice 14 screenshots for attachments and slice 16 `AcpManager` for sending.

## Tests first

1. Store CRUD is atomic and serialized; concurrent writes from two clients do not lose comments; the file is created lazily and ignored when `comments.enabled` is false.
2. Element pick returns a stable selector (prefer `data-test-id`, id, then short structural path) and a rect; clicking outside elements anchors to coordinates only.
3. Send builds the prompt context (story file path, variant, props, selector, screenshot path, user text) and sets status `sent` → `working` → `replied`; agent replies append to the thread with change summaries when the agent reports file edits.
4. "Send N open" sends drafts in order through one agent session per comment.
5. Resolve/reopen and filters; pins hide when a comment is resolved (toggle to show).
6. Pins follow their frames during pan/zoom and hide when their frame is unmounted by the budget.
7. Static builds exclude comments code and never read the comments file.

## Implementation steps

1. Comments reference `storyId`/`variantId`; when a story disappears, comments are kept and shown as "orphaned" in the pane.
2. Composer and thread render as floating cards anchored to the pin, flipping to stay in view.
3. Agent status per comment comes from slice 16 updates; "working" shows progress.
4. Add `.histoire/` to the example `.gitignore` files and document whether to commit `comments.json`.

## Failure paths

No agent configured: Send is replaced by "Set up an agent" linking to Settings → AI agents. Agent error marks the comment `draft` again with the error in the thread.

## Validation commands

~~~bash
pnpm --filter @histoire/shared build
pnpm --filter histoire build
pnpm --filter histoire test
pnpm --filter @histoire/app build
pnpm --filter histoire-example-vue3 test:examples
pnpm run docs:build
~~~

## Acceptance criteria

- Matches Comment for AI (compose, agent reply) and Comments pane boards in both themes.
- End-to-end with a real ACP agent: comment on a variant, send, agent edits a file after permission, reply appears, resolve.

## Non-goals

Multi-user comments, comment sync, comments in static builds, comments on Markdown pages.

## Handoff

Documentation for comments/ACP workflow (user guide) and the final cleanup list: remove unused legacy components, update `docs/` (config reference for `ui`, `agents`, `comments`, `build.changedSince`, `theme.fonts`, `theme.description`), and run all example Cypress suites.
