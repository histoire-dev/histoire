import { useDark, useToggle } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { histoireConfig } from './config.js'

/** Embedded documents receive appearance only from their owning bridge. */
export const isEmbeddedRuntime = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('embed') === 'true'
const scheme = ref<'light' | 'dark' | 'auto'>(histoireConfig.theme.defaultColorScheme)
const prefersDark = ref(typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
const embeddedDark = computed({
  get: () => scheme.value === 'dark' || (scheme.value === 'auto' && prefersDark.value),
  set: (value) => { scheme.value = value ? 'dark' : 'light' },
})
/** Keep standalone document writes behind one owner; embedded appearance never writes host HTML. */
export function applyStandaloneDocumentAppearance(apply: () => void) {
  if (!isEmbeddedRuntime) apply()
}
/** Standalone retains existing preference keys; embed never touches storage. */
export const isDark = isEmbeddedRuntime
  ? embeddedDark
  : useDark({
      valueDark: 'htw-dark',
      initialValue: histoireConfig.theme.defaultColorScheme,
      storageKey: 'histoire-color-scheme',
      storage: histoireConfig.theme.storeColorScheme ? localStorage : sessionStorage,
      /** Retain VueUse transition handling inside the standalone document owner. */
      onChanged(_value, defaultHandler, mode) {
        applyStandaloneDocumentAppearance(() => defaultHandler(mode))
      },
    })
export const toggleDark = useToggle(isDark)

/** Apply bridge-owned appearance without persisting embedded preferences. */
export function applyRuntimeColorScheme(value: 'light' | 'dark' | 'auto') {
  scheme.value = value
  if (!isEmbeddedRuntime) isDark.value = value === 'dark' || (value === 'auto' && prefersDark.value)
}

/** Existing controls peer receives appearance through its document hook. */
function applyDarkToControls() {
  window.__hst_controls_dark?.forEach((value) => {
    value.value = isDark.value
  })
}
watch(isDark, applyDarkToControls, { immediate: true })
window.__hst_controls_dark_ready = applyDarkToControls
const media = window.matchMedia('(prefers-color-scheme: dark)')
function onMedia(event: MediaQueryListEvent) {
  prefersDark.value = event.matches
}
media.addEventListener('change', onMedia)
window.addEventListener('pagehide', () => media.removeEventListener('change', onMedia), { once: true })
