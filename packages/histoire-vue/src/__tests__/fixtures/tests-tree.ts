import type { HistoireTarget } from '@histoire/protocol'
import type { WorkbenchTestRow } from '../../../../histoire-app/src/app/components/panes/tests/types.js'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import TestsTree from '../../../../histoire-app/src/app/components/panes/tests/TestsTree.vue'
import { sourceFixture } from '../../../../histoire-sdk/src/__tests__/fixtures/session.js'

/** Keep reactive tree props on a root test wrapper while real provider owns its resources. */
export async function mountTestsTree(props: {
  /** Current catalog projection. */
  rows: readonly WorkbenchTestRow[]
  /** Current explorer filter. */
  filter: 'all' | 'failing' | 'changed'
  /** Current canonical target. */
  selected: HistoireTarget | null
}) {
  const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, sourceFixture().adapters)
  await session.connect()
  const Host = defineComponent({
    props: ['rows', 'filter', 'selected'],
    setup: props => () => h(HistoireProvider, { session }, { default: () => h(TestsTree, props) }),
  })
  const wrapper = mount(Host, { props, attachTo: document.body })
  return {
    wrapper,
    /** Tear down resource subscriptions before disposing canonical session. */
    async close() {
      wrapper.unmount()
      await session.dispose()
    },
  }
}
