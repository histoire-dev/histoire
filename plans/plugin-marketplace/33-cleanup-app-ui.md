# 33 — Cleanup: app marketplace UI components

Status: **complete**. Cleanup wave B (after 29–32). Follow the shared rules in [29](29-cleanup-shared-logic.md#shared-rules-for-cleanup-slices-2934).

## Owned files

Presentational components: `APP/components/marketplace/{browse,detail,install,shell,update,spotlight}/*.vue` not owned by 32's list, `APP/components/pages/settings/plugins/*.vue`, `APP/components/pages/settings/PluginIcon.vue`, `APP/components/base/**`, `APP/components/menu/{ContextMenu,SubMenu}.vue`, `APP/components/inspector/InspectorTabs.vue`, `APP/components/shell/{WorkbenchPanelAction,RailButton}.vue` (or the rail button component), `APP/components/canvas/toolbar/PluginToolbarItem.vue`, `APP/components/attachments/AttachmentViewer.vue` (or its actual path), AGENTS.md lines about these components. Specs covering these.

## Fixes

1. **Popover overlay default:** `BasePopover` injects an overlay-target key defaulting to the HistoireContext overlay (or root); native dialogs provide their own element. Remove the hand-threaded `context.overlay.value ?? context.root.value` at call sites, `WorkbenchPanelAction`'s `overlayTarget` prop and the store's `overlayTarget` if 32 left it (coordinate through the receipt). Update AGENTS.md accordingly.
2. **One menu keyboard implementation:** a `useMenuKeyboard()` composable (arrow/Home/End/Tab, open from trigger with arrows) used by InspectorTabs, ContextMenu, WorkbenchPanelAction and PluginActionsMenu; `PluginActionsMenu.action()` becomes a typed `emit(value)`; use `PopoverDivider` for its separator.
3. **One chip:** `BaseChip` (tone: neutral/accent/warn/outline) in `components/base/`, replacing the ~14 pasted pill class strings.
4. **Reuse:** `CommandBlock` uses `HstCopyIcon` (drop `use-copy.ts` if unused); `ChangelogTab` renders `update/ReleaseNotes.vue`; `ProgressStep.vue` uses `jobProgressLabel` from slice 32.
5. **Tiles:** `PluginTile` sizes are the ones used (add 36, drop 32) and InstalledPluginRow stops overriding with `!`; `PluginCard` reads `plugin.reason` (drop the prop); one place for the incompatible-reason fallback. Delete orphaned `PluginIcon.vue` if nothing imports it.
6. **Contribution anchors:** every control rendering a contribution (rail button, inspector tab, toolbar item) stamps `data-histoire-contribution=<qualifiedId>`; spotlight anchors use only that attribute (coordinate with 32's `use-spotlight-targets.ts` change via receipt if needed — this slice may edit `anchorFor` in that file).
7. `AttachmentViewer` backdrop uses the scrim token.
