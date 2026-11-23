# Story inspector <Badge type="tip" text="1.0-beta.2+" />

The floating inspector follows the selected variant. Share a link to a tab using `tab=docs`, `tab=events`, or `tab=tests`. The default tab is **Props**.

In **Props**, edit the selected variant with built-in or custom controls. Use **Manage presets**, beside the preset picker, to save, rename, or delete presets. **Reset** restores the variant's initial state. If custom controls fail to load, choose **Retry controls**.

Automatic props with a complete finite `values` or `enum` list show choice buttons. Choices preserve their exact string, number, boolean, or null value; numeric `1` and string `"1"` remain distinct. Unsupported or incomplete lists use the usual type editor. Histoire does not execute a validator to discover choices.

The **Events** badge counts unread events for the selected variant. Open the tab to acknowledge them. Changing variants or restarting the story frame also clears the count.

The standalone **Tests** tab requires a development build connected to a development source. Choose where to run tests and inspect assertion differences and source excerpts under failures. Static books open **Props** for a `tab=tests` link. Embedded SDK panels follow the session's test capabilities.

Expand **Source** and choose **Variant** for generated source or **Story file** for original source. **Copy** uses the displayed text. Development builds with editor support also offer **Open source in editor**. When you edit state, generated source updates and marks the first changed line.

The workbench remembers whether Source and the inspector are open. To reopen a closed inspector, choose **Show inspector**.

The standalone shell owns routing and panel visibility. Native `@histoire/vue` panels use the existing session and story runtime. Matrix controls use the `matrix-props` slot while keeping the session's selected variant.
