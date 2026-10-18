import type { HistoireSession } from '@histoire/sdk'
import type { ShellStore } from '../../../../histoire-app/src/app/stores/shell.js'
import { HistoireProvider } from '@histoire/vue'
import { mount } from '@vue/test-utils'
import { onTestFinished } from 'vitest'
import { defineComponent, h } from 'vue'
import SourceDrawer from '../../../../histoire-app/src/app/components/inspector/SourceDrawer.vue'
import { provideShell } from '../../../../histoire-app/src/app/composables/shell.js'
import { createShell } from '../../../../histoire-app/src/app/stores/shell.js'

/** Mount real source UI with its caller-owned shell and session. */
export function mountSourceDrawer(session: HistoireSession, props: { onError?: (error: unknown) => void } = {}, shell: ShellStore = createShell({ dev: true })) {
  const Host = defineComponent({
    setup() {
      provideShell(shell)
      return () => h(SourceDrawer, props)
    },
  })
  const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(Host) } })
  onTestFinished(() => {
    wrapper.unmount()
    shell.close()
  })
  return wrapper
}
