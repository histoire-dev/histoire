import { watch } from 'vue'
import { useDark, useToggle } from '@vueuse/core'

export const isDark = useDark({ valueDark: 'htw-dark' })
export const toggleDark = useToggle(isDark)

function applyDarkToControls () {
  window.__hst_controls_dark?.forEach(ref => {
    ref.value = isDark.value
  })
}

watch(isDark, () => {
  applyDarkToControls()
}, {
  immediate: true,
})

window.__hst_controls_dark_ready = () => {
  applyDarkToControls()
}
