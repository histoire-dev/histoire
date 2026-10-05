import type { PropType } from 'vue'
import type { RouterLinkProps } from 'vue-router'

/** Shared destination contract for components wrapping a custom RouterLink. */
export const routerLinkProps = {
  /** Destination accepted by vue-router, including named routes and query state. */
  to: {
    type: [String, Object] as PropType<RouterLinkProps['to']>,
    required: true,
  },
} as const
