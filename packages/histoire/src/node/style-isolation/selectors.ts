// Centralised CSS scope-root class names used by the style-isolation
// pipeline. Keep in sync with the runtime markers applied in
// histoire-app (App.vue's `histoire-app-root` wrapper, GenericRenderStory's
// `__histoire-render-story` class, sandbox.ts's body class).

export const APP_SCOPE_ROOT = '.histoire-app-root'
export const STORY_SCOPE_ROOT = '.__histoire-render-story'
export const DEFAULTS_LAYER = 'histoire-defaults'
