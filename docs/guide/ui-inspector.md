# Story inspector

The floating inspector follows the selected variant. Its Props, Docs, Events and Tests tabs preserve the existing story URL values: an empty `tab` value for Props, then `docs`, `events` and `tests`.

The standalone Tests tab requires a development build connected to a development source. Static builds show Props for a `tab=tests` URL. Embedded SDK test components retain their capability-based behavior.

Props use the same runtime state, automatic prop controls, saved presets and custom controls as the preview. **Manage presets**, left of the preset select, opens a menu to save, rename or delete presets. Name entry stays inside that menu. Reset restores the selected variant's initial state. Custom controls stay inside their source-owned sandbox; a failed sandbox shows **Retry controls**.

Automatic props with a complete finite `values` or `enum` list show choice buttons. Choices preserve their exact string, number, boolean, or null value; numeric `1` and string `"1"` remain distinct. Unsupported or incomplete lists use the usual type editor. Histoire does not execute a validator to discover choices.

The Events badge counts unread events for the selected runtime. Opening Events acknowledges them. Changing variant or replacing its runtime clears the unread count. Tests share the preview's test model, retain explicit preview/server run actions, and show assertion differences and available source excerpts under each failure.

Source starts collapsed. Expand it to switch between **Variant** (generated from current preview state) and **Story file** (original source). Copy uses the displayed text; development builds with editor capability also offer **Open source in editor**. Generated source marks its first changed line after a state edit. Empty or unavailable source is distinct from a failed source operation.

Unrelated settings and event updates preserve loaded source and Copy availability. Generated source refreshes when its owning preview state changes; a new story, source revision, or mode replaces the content.

Closing the inspector persists through story and variant changes. Reopen it using the workbench inspector action.

The standalone shell owns routing, isolated-preview URLs and visibility. Native panels remain session-scoped `@histoire/vue` components; the inspector neither executes story modules nor creates another preview. Matrix controls use the inspector's `matrix-props` slot without replacing the session-selected variant.
