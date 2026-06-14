// Centralised CSS scope-root class names used by the style-isolation
// pipeline. Keep in sync with the runtime markers applied in
// histoire-app (App.vue's `histoire-app-root` wrapper, GenericRenderStory's
// `__histoire-render-story` class, sandbox.ts's body class).

export const APP_SCOPE_ROOT = '.histoire-app-root'
export const STORY_SCOPE_ROOT = '.__histoire-render-story'
// Custom-controls panels carry both classes (.__histoire-render-story and
// .__histoire-render-custom-controls) but render inside the chrome panel,
// so the @scope boundary must keep them in chrome scope.
export const STORY_SCOPE_BOUNDARY = '.__histoire-render-story:not(.__histoire-render-custom-controls)'
export const DEFAULTS_LAYER = 'histoire-defaults'
