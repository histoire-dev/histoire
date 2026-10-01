/**
 * Stands in for the `virtual:$histoire-config` module the app builds at dev/build
 * time. Specs driving app-side stores import modules that read the resolved
 * user config; in a node spec there is no Vite plugin to generate it, so they
 * get an empty one (every consumer falls back to its own defaults).
 */
export const config = {}

export const logos = {}
