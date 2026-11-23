# Workbench navigation <Badge type="tip" text="1.0-beta.2+" />

Select a story and variant, then copy the URL to share that selection. Story links use `/story/:storyId` with `variantId` and `tab` when applicable. Rail panes and panel visibility stay local to your browser.

## Stories

The Stories pane follows configured tree groups, folder order, and titles. Opening a story reveals its variants. Selecting another variant keeps the same story active; document-only stories open a scrolling Markdown page.

Use Search to find titles, folder paths, source paths, docs, and loaded props. The Stories pane remembers open folders in your browser.

Within the tree, Up and Down move focus. Right opens a folder or enters its children; Left closes it or returns to its parent. Enter selects a story or variant. Test failures and collection warnings appear beside their related rows.

## Search

Open **Search** from the rail or press `⌘K` (`Ctrl+K` on Windows and Linux). Choose **All**, **Stories**, **Docs**, or **Props**. The Props scope searches definitions from variants already loaded in the workbench.

Use the arrow keys to move through results. Press Enter to open a result, or `⌘Enter` or `Ctrl+Enter` to open the isolated variant. Documentation results open the **Docs** tab at the result's heading when available.

Matching variants in the current story are highlighted; other frames dim while results are current. The toolbar shows match position and Previous/Next actions. These actions, and Tab from the search input, pan through matching frames in catalog order without selecting a variant or changing its URL. Escape clears search and returns focus through the shell. Clearing or closing Search removes the dimming.

Matrix cells can share a story and variant with different props. Search does not guess which cell matches: Matrix omits frame dimming and the match stepper.

Prefix a query with `>` to find commands. Development books can also offer built-in and server-backed commands. Static books can offer commands registered by workbench plugins. Commands that need input open a form.

## Tests

Open **Tests** in development for project-wide browser tests. When visual testing is enabled, use **Functional** for browser assertions and **Visual** for [image comparisons](./visual-testing.md).

In functional tests, **Run all** runs a single project batch while leaving your current story open. **Failing** shows failed assertions and collection problems. **All** lists the collected variants, and **Changed** shows outdated results after story edits. Select a result to open its variant and the inspector's **Tests** tab.

Watch mode runs all variants of an edited story in one request. Changes arriving during a run are queued for a later batch. Disable **Watch** to stop automatic reruns. The workbench remembers this setting in your browser.

**Stop** stops new results appearing for that batch and marks the active target outdated. The server finishes cleaning up before another run can start.

## Home and guides

**Home** uses the story tree to organize **Browse** and **Guides**. In development, it shows live story counts, collection errors, failed tests, and Git branch and commit when available. A built book shows its build date and available project version, Git information, and release updates.

Document-only stories use a normal scrolling reading layout. On this page follows headings within the document. Previous and next links follow documentation order within the same tree group. Copy link preserves the current URL and heading anchor. Edit is available when the development source permits opening its collected file in an editor.

Theme and unrelated settings changes preserve the current document's scroll position, heading, and source metadata. Switching documents or receiving a new content revision refreshes them.
