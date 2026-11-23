# Workbench layout <Badge type="tip" text="1.0-beta.2+" />

<DemoPreview />

Browse stories on the left, compare variants on the canvas, and edit the selected variant in the inspector. Use **Open demo** above to try the static book. Development adds tests, comments, screenshots and MCP activity.

Use **Stories**, **Search**, **Tests**, or **AI** in the left rail to switch panels. Select the active button again or use the collapse button near **Settings** to close the panel. Find threads, canvas comments, and MCP activity under **AI**.

The rail is 56px wide; expanded panels default to 280px. Drag the panel's outer edge or inspector's inner edge to resize. Focus either separator and use Left/Right arrows, Shift for larger steps, or Home/End for width limits. Widths persist locally and stay bounded to available workspace. The floating inspector defaults to 344px, can be resized or closed, and cannot be moved or pinned.

On containers at most 640px wide, the rail moves to the bottom and panels open over the workspace. Choosing a story dismisses this overlay. Canvas fit and floating tools account for the visible inspector width.

Choose **Select** (`V`), **Pan** (`H`), or **Measure** (`M`) in the canvas toolbar. Single variant view disables the **Pan** tool and its `H` shortcut. Where panning is available, hold Space and drag or use the middle mouse button to pan without switching tools.

With **Measure** active, hover the selected variant to inspect its size and spacing. Click, press Enter, or press Space to lock or release the measurement. Changing the tool, selected variant, or running story frame clears the lock.

**Single variant** shows one variant. **Responsive** fills the available canvas space. Use a viewport preset, enter dimensions, or drag the right, bottom, or corner grips for a fixed size. The separators also support arrow keys, Shift for larger steps, and Home or End for the size limits. Use `arrange=single` to open this arrangement by URL.

**Fit** scales oversized viewports down and keeps smaller ones at 100%. Resizing with the frame grips keeps the current scale and switches to manual zoom. Select **Fit** or **Responsive** again to restore automatic scaling or sizing. In Single variant, scroll oversized content normally.

Histoire remembers zoom separately for Single variant, Grid, List, and Props matrix. With **Sync zoom across stories** off, switching stories resets the active arrangement to Fit.

In Grid and List, selecting another variant updates the inspector while mounted frames keep their documents and state. `ui.frameBudget` limits how many frames stay live. Returning to an unmounted frame restores retained editable state. DOM-only state lasts for the life of its frame.

Props show a loading skeleton until the selected document reports custom-control availability. Generic state editors appear only when that document has no authored controls, avoiding temporary duplicate editors during startup.

Static builds include Home, Stories, Search, appearance controls, panel collapse, and Settings. Dev-only destinations are omitted. Opening a static book with an old dev pane preference restores Stories.

Press **Ctrl/⌘ Shift D** to switch light/dark appearance. **Ctrl/⌘ K** retains the story and command palette. The existing `theme.hideColorSchemeSwitch` option controls the appearance switch.

Panel and inspector preferences stay in your browser. Use a story URL with `variantId` and `tab` to share the variant and inspector tab.

## Hide and restore UI

Choose **Hide UI** in the canvas toolbar or press **Ctrl/⌘ Shift H** to focus on the canvas. Right-click the canvas and choose **Show UI**, or use the same shortcut, to restore workbench controls. Context menus remain available while UI is hidden.
