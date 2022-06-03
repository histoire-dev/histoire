import { useDark, useToggle } from '@vueuse/core'

export const isDark = useDark({ valueDark: 'dark' })
export const toggleDark = useToggle(isDark)
