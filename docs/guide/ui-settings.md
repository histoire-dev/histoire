# Workbench settings

Open Settings from the rail. General, Appearance, Viewports, Keyboard shortcuts, and About are available in development and static books. Tests, AI agents, and MCP server are development-only. Invalid or unavailable section URLs recover to Appearance.

Color scheme uses the existing `histoire-color-scheme` preference and updates the owning session. Projects can hide its controls with `theme.hideColorSchemeSwitch`. Density, zoom synchronization, and test watching are local preferences. They never write project files.

Compact density reduces row and control spacing in Settings, rail panes, and the inspector. It keeps text sizes and preview content unchanged. Switching density preserves list focus and keyboard navigation.

Viewport and background edits override project presets locally. Removing a project preset hides it for this browser. Reset to project removes that collection's local edits and restores current project defaults. Toolbar pickers use the same merged collections. A null or omitted viewport height means Auto; project saves preserve existing null heights.

Local presets keep a stable identity across renames and restarts. Reusing an old label creates a separate preset. Updated project defaults remain live for untouched rows; explicit local edits keep precedence.

## Save to project

Development Settings shows each option's source and offers Save to project for literal options. Review the changed value lines, then choose Confirm save. Files are edited by the server with formatting-preserving changes, bound to the exact revision read by the browser. An external edit causes a conflict and a fresh source read; saves are never replayed automatically.

Local overrides retire only after the saved file hash and effective project settings are verified. Pending or failed saves keep them. A reconnect or Settings remount checks the existing save receipt without repeating the write. Each matching submitted value is retired once; edits made after submitting remain local.

Writable options are `responsivePresets`, `backgroundPresets`, `theme.defaultColorScheme`, `ui.defaultArrange`, `agents.presets`, and `agents.permissions`. ACP environment overrides remain user-level and are rejected by project saves. Density, zoom synchronization, test watching, agent opt-ins, and context preferences remain local.

Imported, computed, and function-only settings cannot be overwritten. Copy snippet supplies valid TS/JS for manual integration. When no config exists, the server creates an appropriate TS/JS config. Before changing the watched file, the server loads candidate source from the same directory. A load failure preserves original config bytes and reports failure without exposing execution details to the browser. Config is also checked at its final filename after publication; a load failure restores the session backup while that exact write still owns the revision. Successful writes use the existing config watcher to restart once.

Browser storage denial leaves preferences functional in memory. Corrupt stored preferences are discarded with a warning. Settings stores and socket observers belong to one workbench lifetime; embedded providers do not inherit standalone storage or config writers.
