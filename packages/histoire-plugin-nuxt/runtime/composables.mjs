// Preserve generated-template import while resolving actual isolated Nuxt app.
// A no-op app loses module injections, hooks and variant-owned composable state.
export { useNuxtApp } from '#app/nuxt'
