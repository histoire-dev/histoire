import { withItemType } from '@rstore/vue'

/** Local query item shared by Nuxt schema and story-owned store. */
export interface FixtureItem {
  /** Stable normalized cache key. */
  id: string
  /** Visible fixture label. */
  label: string
}

export default withItemType<FixtureItem>().defineCollection({ name: 'items' })
