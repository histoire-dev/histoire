# Workbench navigation

Histoire keeps story selection in the URL. Existing `/story/:storyId`, `variantId`, and `tab` links continue to work. Rail panes and panel visibility are local preferences.

## Stories

The Stories pane follows configured tree groups, folder order, and titles. Opening a story reveals its variants. Selecting another variant keeps the same story active; document-only stories open a scrolling Markdown page.

Use the Search pane to search titles, folder paths, source paths, documentation and loaded props. Stories keeps one browse tree without a second filter. Folder state persists in `_histoire-tree-state`.

Within the tree, Up and Down move focus. Right opens a folder or enters its children; Left closes it or returns to its parent. Enter selects a story or variant. Test failures and collection warnings appear beside their related rows.

## Search

Use the Search rail button or `⌘K` (`Ctrl+K` on Windows/Linux). Scopes select All, Stories, Docs, or Props. Story and documentation results retain the source search ranking. Props searches definitions from variants already loaded in the workbench.

Up and Down move through results. Enter opens the selected result; `⌘Enter` or `Ctrl+Enter` opens its isolated preview. Documentation results open the Docs tab. A supplied heading anchor is preserved during activation.

Matching variants in the current story are highlighted; other frames dim while results are current. The toolbar shows match position and Previous/Next actions. These actions, and Tab from the search input, pan through matching frames in catalog order without selecting a variant or changing its URL. Escape clears search and returns focus through the shell. Clearing or closing Search removes the dimming.

Matrix cells can share a story and variant with different props. Search does not guess which cell matches: Matrix omits frame dimming and the match stepper.

In development, prefix a query with `>` to find registered commands. Commands with prompts open their existing parameter form.

## Tests

Development mode includes a project Tests pane. Run all executes one project batch through the shared server execution lane without changing the currently open story. Stories are collected once, then Vitest owns test-file parallelism. Failed assertions, skipped tests, collection problems, and outdated results remain distinct.

Failing shows assertion failures and collection problems. All lists the collected variants. Changed shows results invalidated by a story edit. Selecting a result opens that variant and the inspector's Tests tab.

Watch mode runs all variants of an edited story in one request. Changes arriving during a run are queued for a later batch. Disabling Watch stops automatic reruns. Watch preferences persist in `_histoire-ui-settings`.

Stopping a batch cancels its local result publication and marks the active target outdated. Server execution retains ownership of its current operation and the shared lane until teardown finishes.

## Home and guides

Home derives Browse sections and Guides from the configured story tree. Search opens the shared Search pane. Build metadata shows project version, build time, and Git information when available. Release updates appear when the build has change metadata.

In development, collected story changes update Home's catalog counts and build metadata without a page reload. Build time identifies the server generation, rather than each story edit.

The development home also shows collected errors and failed tests. Static builds omit development sections and server test actions.

Document-only stories use a normal scrolling reading layout. On this page follows headings within the document. Previous and next links follow documentation order within the same tree group. Copy link preserves the current URL and heading anchor. Edit is available when the development source permits opening its collected file in an editor.

Theme and unrelated settings changes preserve the current document's scroll position, heading, and source metadata. Switching documents or receiving a new content revision refreshes them.
