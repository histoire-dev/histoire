import { definePlugin } from '@rstore/vue'

/** No transport: return detached rows directly from local fixture hook. */
export default definePlugin({
  name: 'histoire-fixture',
  category: 'virtual',
  setup({ hook }) {
    hook('fetchMany', ({ collection, setResult }) => {
      if (collection.name === 'items') {
        setResult([{ id: 'one', label: 'First item' }, { id: 'two', label: 'Second item' }])
      }
    })
  },
})
