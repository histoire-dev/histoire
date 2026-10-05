# 13 — Context menu and shortcuts

## Outcome and prerequisites

Depends on: 04, 05.

Right-clicking a frame (or pressing the context-menu key / ⇧F10 on a focused frame) opens a menu: Open isolated, Open in editor (dev), Reveal in tree, Copy source, Copy link, Screenshot (enabled by 14), Run tests (dev), Compare to main (hidden until a compare feature exists), Save props as variant (copy snippet), Comment for AI and Ask agent › (enabled by 17/16). One shortcut registry drives menus, toolbar tooltips, and the settings Shortcuts section.

## Owned files

- Add `app/components/menu/{ContextMenu,MenuItem,SubMenu}.vue` and `app/composables/context-menu.ts`.
- Add `app/util/shortcuts.ts` (registry: id, keys, scope, handler, devOnly) replacing scattered `util/keyboard.ts` uses; keep `BaseKeyboardShortcut` rendering.
- Add frame actions in `app/util/frame-actions.ts` (each action is enabled by capability flags so slices 14, 16, 17 register theirs).

## Tests first

1. Right-click on a frame targets that frame's story/variant (not the selected one) and does not change selection until an action runs.
2. Keyboard opening and arrow navigation; Escape closes and restores focus; submenus open on Right.
3. Dev-only and capability-gated items are hidden (not disabled) when unavailable; disabled items explain why on hover.
4. Copy source uses the same generator as the Source drawer; Copy link builds the canonical story URL.
5. Registry rejects duplicate key bindings within a scope; Space (pan), ⌘K (search), ⌘⇧D (theme) keep working.
6. Native context menu still appears inside the preview iframe content (the menu only handles the frame chrome/overlay).

## Implementation steps

1. Menu renders in a top-level layer (z-index from slice 02) with viewport-edge flipping.
2. Actions receive `{ storyId, variantId, frameKey }` and run through the frame registry from slice 04.
3. Migrate existing shortcuts (search, theme, open in editor, panes) into the registry.

## Failure paths

Clipboard failures show a toast with the text selected for manual copy.

## Validation commands

~~~bash
pnpm --filter @histoire/app build
pnpm --filter histoire test
pnpm --filter histoire-example-vue3 test:examples
~~~

## Acceptance criteria

- Matches the Right-click menu boards in both themes; all listed actions work or are correctly hidden.

## Non-goals

User-customizable key bindings (registry is read-only in this release).

## Handoff

`registerFrameAction` API and shortcut registry for slices 14, 16, 17.
