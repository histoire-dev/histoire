# Slice 04 — Bounded docs and raw source access

## Outcome and prerequisites

Read docs/raw source solely through catalog targets, with containment, bounded paging, hashes, and stale detection. Depends on 03. No browser or framework source parser is needed.

## File ownership

- Modify `packages/histoire/src/node/virtual/story-source.ts` to reuse raw source reader.
- Add `packages/histoire/src/node/story-source.ts` with physical/virtual source read helper used by existing Source panel and MCP service.
- Add `packages/histoire/src/node/mcp/project/{content,containment,text-pages,source-pages}.ts`.
- Add `packages/histoire/src/node/__tests__/mcp/{content,containment}.spec.ts`.
- Reuse existing Markdown and virtual-story fixtures; put additional temporary path fixtures in shared MCP project harness.

## Tests first

1. Physical Vue/Svelte source matches file bytes; virtual Markdown source returns generated module with `kind: virtual`; no synthetic generated example is mislabelled raw source.
2. Docs precedence matches sibling > standalone > collected text; empty docs differs from absent docs. Inline Vue collected text needs no SFC parser.
3. Registered symlink outside root, sibling path traversal, Windows-like absolute path, NUL, foreign story ID, and file replaced with outside symlink cannot disclose external content.
4. Source line pages handle CRLF, Unicode, trailing newline, empty file, oversized line, and valid range end. Docs character paging cannot split surrogate pairs/code points.
5. Content changed after catalog publication returns `STALE_REVISION` even if caller omitted expectedRevision; explicit stale expectedRevision fails before read.
6. Returned full-content SHA-256 is stable across pages and differs on file edits. Whole-file byte bound rejects oversized source without buffering unlimited content.

## Implementation steps

1. Extract physical/virtual source selection from existing virtual module into one raw reader. Normal Source panel retains existing behavior and JavaScript wrapping; MCP supplies extra containment/size policy before reading. Do not narrow existing support for externally registered stories outside MCP.
2. Implement canonical root containment using `realpath`, `relative`, and platform-safe path checks. Inputs are registered catalog paths, never user-supplied paths. Reject root escape and non-regular files.
3. Resolve/open registered file, validate actual opened file identity and post-read canonical path/stat, and reject changes. Use no-follow semantics where platform supports them, with identity checks as portable fallback. Bound read while consuming, not merely using an initial stat. Do not promise protection from a malicious local process already controlling trusted project.
4. Use snapshot content index to choose docs/source and compare hash against captured revision. Markdown may reuse captured content if index hash matches current file. Collected text comes from immutable snapshot, not live mutable story.
5. Implement reusable byte budget plus domain-specific code-point and line paging. Preserve exact source text/line endings; UTF-8 hash covers full content. Reject unsafe/too-large ranges without silently changing selected text.
6. Map unavailable source/empty docs/domain errors to contract codes. Sanitize server errors and relative paths; never return full filesystem error stack.
7. Content service accepts `storyId` and optional expectedRevision; transport/resource handlers later call same service. No separate resource read implementation.

## Acceptance and validation

Run content/containment specs, existing story-source/Markdown consumers, core build, and focused lint. Perform real temporary-project symlink test and cross-platform path-unit cases. Record platform where no-follow/file identity integration ran. Source panel still renders physical and virtual source as before.

## Non-goals and handoff

No dependency source recursion, component prop reflection, automatic source code generation, raw inline Markdown extraction, HTML docs rendering, or filesystem mutation. Handoff is one content service and shared raw reader; 05 adds wire registration only.
