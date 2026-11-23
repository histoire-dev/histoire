# Workbench settings <Badge type="tip" text="1.0-beta.2+" />

Open **Settings** from the rail. **General**, **Appearance**, **Viewports**, **Keyboard shortcuts**, **Plugins**, and **About** are available in development and static books. **Tests**, **AI agents (ACP)**, and **MCP server** are available in development. Unavailable settings links open **Appearance**.

Color scheme uses the existing `histoire-color-scheme` preference and updates the owning session. Projects can hide its controls with `theme.hideColorSchemeSwitch`. Density, zoom synchronization, and test watching are local preferences. They never write project files.

Compact density reduces spacing between rows and controls in Settings, rail panes, and the inspector. Text size, canvas content, and keyboard focus stay the same.

Viewport and background edits override project presets locally. Removing a project preset hides it for this browser. Reset to project removes that collection's local edits and restores current project defaults. Toolbar pickers use the same merged collections. A null or omitted viewport height means Auto; project saves preserve existing null heights.

Background picker includes Light checkerboard and Dark checkerboard after configured colors. All frames updates the shared background and clears frame overrides; Selected changes only the selected frame. Shared choices persist in this browser, while frame overrides last for the current canvas. Checkerboard palettes stay independent of the workbench color scheme. PNG exports and comment captures keep transparent pixels instead of including the pattern.

Local presets keep a stable identity across renames and restarts. Reusing an old label creates a separate preset. Updated project defaults remain live for untouched rows; explicit local edits keep precedence.

## Save to project

In development, choose **Save to project** for a supported setting, review the changed lines, and choose **Confirm save**. The server preserves file formatting and applies the edit to the revision you reviewed. If the file changes before the save, Histoire shows a conflict and loads the latest source for review.

Your local overrides stay active until Histoire verifies the saved file and effective project settings. Reconnecting or reopening Settings checks the existing save. Changes you make after submitting stay local.

Writable options are `responsivePresets`, `backgroundPresets`, `theme.defaultColorScheme`, `ui.defaultArrange`, `agents.presets`, and `agents.permissions`. ACP environment overrides remain user-level and are rejected by project saves. Density, zoom synchronization, test watching, agent opt-ins, and context preferences remain local.

Imported, computed, and function-only settings cannot be overwritten. Copy snippet supplies valid TS/JS for manual integration. When no config exists, the server creates an appropriate TS/JS config. Before changing the watched file, the server loads candidate source from the same directory. A load failure preserves original config bytes and reports failure without exposing execution details to the browser. Config is also checked at its final filename after publication; a load failure restores the session backup while that exact write still owns the revision. Successful writes use the existing config watcher to restart once.

Browser storage denial leaves preferences functional in memory. Corrupt stored preferences are discarded with a warning. Settings stores and socket observers belong to one workbench lifetime; embedded providers do not inherit standalone storage or config writers.

Default arrangement supports **Single variant**, **Grid**, and **List**. Explicit story layouts override this default; URL and remembered story/shared view choices retain precedence. Single viewport Responsive/fixed intent stays in workbench memory, while chosen fixed dimensions use existing viewport settings.

## Plugins

Plugins lists installed versions, Required labels and compatible updates. **Browse marketplace** opens the [plugin marketplace](./plugins/marketplace.md). More actions provides Options, Changelog, Pin version and Remove. Required plugins cannot be disabled or removed. Development enable switches stage changes for **Apply and restart**.

Marketplace preferences are local to this browser:

- **Community plugins**: off by default; permits development-server registry reads for community discovery and release history.
- **Package manager**: automatic detection, or pnpm, npm, Yarn or Bun override.
- **After install**: restart automatically, or ask before continuing the config write/restart.
- **Skip this version**: remembers dismissed update targets per package.

These preferences persist alongside other UI settings and reset with them. Plugin changes write to `package.json` and the Histoire config; the package manager can also change lockfiles and `node_modules`. Review each change before installation. Static books provide copyable manual commands and config snippets instead of project writes.
