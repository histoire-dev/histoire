import { useDark, useToggle } from '@vueuse/core'

export const isDark = useDark({ valueDark: 'htw-dark' })
export const toggleDark = useToggle(isDark)
