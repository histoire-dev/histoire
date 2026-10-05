# 11 — Markdown pages

## Outcome and prerequisites

Depends on: 02, 03.

Docs-only stories (`*.story.md`, `docsOnly: true`) render as a scrolling document in the main area: source path, title, content, embedded live variants with "Open story", callouts, next/previous links, and an "On this page" outline. No canvas, toolbar, inspector, or panning. Edit .md (dev only) and Copy link sit top right.

## Owned files

- Add `app/components/pages/markdown/{MarkdownPage,MarkdownOutline,MarkdownPager}.vue`.
- Reuse the existing Markdown renderer output (`virtual:$histoire-markdown-files`, `util/docs.ts`) and `StoryDocs` rendering; do not add a second renderer.
- Update `components/story/StoryView.vue` (or its replacement) to route docs-only stories to `MarkdownPage`.
- Styles in `app/style/markdown.pcss` using tokens (replaces typography plugin defaults where they conflict).

## Tests first

1. Docs-only story route renders `MarkdownPage`, not the canvas.
2. Outline lists h2/h3 headings; clicking scrolls within the page container; active heading follows scroll.
3. Embedded variant links/blocks resolve to the right story and open it.
4. Previous/next follow tree order within the same group.
5. Edit .md uses existing open-in-editor helper in dev; hidden in static builds.

## Implementation steps

1. Page column max 680px; outline 200px column shown when width allows.
2. Keep anchor IDs from the renderer; scope anchor lookup to the page root (embeddable SDK coordination).
3. Copy link copies the current URL with hash anchor.

## Failure paths

Missing Markdown content shows an empty state with the file path.

## Validation commands

~~~bash
pnpm --filter @histoire/app build
pnpm --filter histoire build
pnpm --filter histoire test
pnpm --filter histoire-example-vue3 test:examples
~~~

## Acceptance criteria

- Matches the Markdown page boards in both themes; docs Cypress specs pass.

## Non-goals

MDX, in-browser Markdown editing.

## Handoff

Outline composable for reuse in the inspector Docs tab if wanted.
