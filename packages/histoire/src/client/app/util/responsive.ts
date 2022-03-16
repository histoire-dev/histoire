import { useMediaQuery } from '@vueuse/core'

export const isDesktop = useMediaQuery('(min-width: 640px)')
