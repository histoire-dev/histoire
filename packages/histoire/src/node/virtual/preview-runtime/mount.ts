/**
 * Emits the app bootstrap: Pinia and FloatingVue registration, the mount into
 * the root element, and the watcher mirroring the host dark mode onto the
 * sandbox document.
 */
export function previewMount() {
  return `app.use(createPinia())
app.use(FloatingVue, {
  overflowPadding: 4,
  arrowPadding: 8,
  themes: {
    tooltip: { distance: 8 },
    dropdown: { computeTransformOrigin: true, distance: 8 },
  },
})
app.mount(root)

watch(isDark, value => {
  document.documentElement.classList.toggle(histoireConfig.sandboxDarkClass, value)
  document.documentElement.classList.toggle(histoireConfig.theme.darkClass, value)
}, {
  immediate: true,
})`
}
